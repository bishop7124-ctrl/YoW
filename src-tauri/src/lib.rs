use serde::{Deserialize, Serialize};
use std::ffi::{CStr, CString};
use std::fs;
use std::os::raw::{c_char, c_int, c_void};
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

#[allow(non_camel_case_types)]
enum sqlite3 {}
#[allow(non_camel_case_types)]
enum sqlite3_stmt {}

type SqliteDestructor = Option<unsafe extern "C" fn(*mut c_void)>;

const SQLITE_OK: c_int = 0;
const SQLITE_ROW: c_int = 100;
const SQLITE_DONE: c_int = 101;
const AUTO_SNAPSHOT_MIN_INTERVAL_SECONDS: u64 = 15 * 60;
const AUTO_SNAPSHOT_RETENTION: usize = 10;

// kind = "static" matches libsqlite3-sys's "bundled" feature, which always
// compiles a real static archive (not a DLL import lib) on every platform.
#[link(name = "sqlite3", kind = "static")]
extern "C" {
  fn sqlite3_open(filename: *const c_char, pp_db: *mut *mut sqlite3) -> c_int;
  fn sqlite3_close(db: *mut sqlite3) -> c_int;
  fn sqlite3_errmsg(db: *mut sqlite3) -> *const c_char;
  fn sqlite3_exec(
    db: *mut sqlite3,
    sql: *const c_char,
    callback: Option<unsafe extern "C" fn(*mut c_void, c_int, *mut *mut c_char, *mut *mut c_char) -> c_int>,
    arg: *mut c_void,
    errmsg: *mut *mut c_char,
  ) -> c_int;
  fn sqlite3_prepare_v2(
    db: *mut sqlite3,
    sql: *const c_char,
    n_byte: c_int,
    pp_stmt: *mut *mut sqlite3_stmt,
    pz_tail: *mut *const c_char,
  ) -> c_int;
  fn sqlite3_bind_text(
    stmt: *mut sqlite3_stmt,
    index: c_int,
    value: *const c_char,
    n: c_int,
    destructor: SqliteDestructor,
  ) -> c_int;
  fn sqlite3_step(stmt: *mut sqlite3_stmt) -> c_int;
  fn sqlite3_column_text(stmt: *mut sqlite3_stmt, column: c_int) -> *const c_char;
  fn sqlite3_column_bytes(stmt: *mut sqlite3_stmt, column: c_int) -> c_int;
  fn sqlite3_finalize(stmt: *mut sqlite3_stmt) -> c_int;
}

#[derive(Serialize)]
struct VaultEntry {
  key: String,
  value: String,
}

#[derive(Serialize)]
struct VaultInfo {
  vault_path: String,
  vault_dir: String,
  backup_dir: String,
  default_dir: String,
  configured_dir: Option<String>,
  using_configured: bool,
  exists: bool,
  size_bytes: u64,
  wal_size_bytes: u64,
  entry_count: i64,
}

#[derive(Deserialize)]
struct VaultLocationConfig {
  vault_dir: String,
}

#[derive(Serialize)]
struct VaultRelocateResult {
  mode: String,
  vault_dir: String,
  vault_path: String,
  previous_vault_path: String,
}

#[derive(Serialize)]
struct VaultSnapshot {
  name: String,
  path: String,
  size_bytes: u64,
  modified_seconds: u64,
}

#[derive(Serialize)]
struct VaultRestoreResult {
  restored_path: String,
  safety_snapshot_path: String,
}

#[derive(Serialize)]
struct VaultIntegrityStatus {
  ok: bool,
  message: String,
  latest_snapshot: Option<VaultSnapshot>,
}

struct Db {
  raw: *mut sqlite3,
}

impl Drop for Db {
  fn drop(&mut self) {
    unsafe { sqlite3_close(self.raw); }
  }
}

fn sqlite_transient() -> SqliteDestructor {
  unsafe { std::mem::transmute(-1_isize) }
}

fn db_error(db: *mut sqlite3) -> String {
  unsafe {
    let msg = sqlite3_errmsg(db);
    if msg.is_null() {
      "unknown sqlite error".to_string()
    } else {
      CStr::from_ptr(msg).to_string_lossy().into_owned()
    }
  }
}

fn cstring(value: &str) -> Result<CString, String> {
  CString::new(value).map_err(|_| "value contains an interior nul byte".to_string())
}

fn vault_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  Ok(vault_dir(app)?.join("vault.db"))
}

// The app-data directory is fixed; it always holds the vault-location config,
// and is the vault's home unless the user relocated it.
fn app_default_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|error| format!("Could not locate app data directory: {error}"))?;
  fs::create_dir_all(&dir).map_err(|error| format!("Could not create vault directory: {error}"))?;
  Ok(dir)
}

fn vault_location_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  Ok(app_default_dir(app)?.join("vault-location.json"))
}

fn configured_vault_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
  let path = vault_location_config_path(app).ok()?;
  let raw = fs::read_to_string(path).ok()?;
  let config: VaultLocationConfig = serde_json::from_str(&raw).ok()?;
  let dir = PathBuf::from(config.vault_dir);
  if dir.as_os_str().is_empty() { None } else { Some(dir) }
}

fn write_vault_location_config(app: &tauri::AppHandle, dir: &PathBuf) -> Result<(), String> {
  let path = vault_location_config_path(app)?;
  let payload = serde_json::json!({ "vault_dir": dir.to_string_lossy() }).to_string();
  fs::write(&path, payload).map_err(|error| format!("Could not save the vault location: {error}"))
}

// If a configured location is unreachable (for example an unplugged external
// drive), fall back to the default rather than failing every vault command;
// vault_info exposes using_configured so the UI can warn about the fallback.
fn vault_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  if let Some(dir) = configured_vault_dir(app) {
    if fs::create_dir_all(&dir).is_ok() {
      return Ok(dir);
    }
  }
  app_default_dir(app)
}

fn backup_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  let dir = vault_dir(app)?.join("Backups");
  fs::create_dir_all(&dir).map_err(|error| format!("Could not create backup directory: {error}"))?;
  Ok(dir)
}

fn exec(db: *mut sqlite3, sql: &str) -> Result<(), String> {
  let sql = cstring(sql)?;
  let result = unsafe { sqlite3_exec(db, sql.as_ptr(), None, std::ptr::null_mut(), std::ptr::null_mut()) };
  if result == SQLITE_OK { Ok(()) } else { Err(db_error(db)) }
}

fn open_vault(app: &tauri::AppHandle) -> Result<Db, String> {
  let path = vault_path(app)?;
  let path = cstring(&path.to_string_lossy())?;
  let mut raw: *mut sqlite3 = std::ptr::null_mut();
  let result = unsafe { sqlite3_open(path.as_ptr(), &mut raw) };
  if result != SQLITE_OK {
    let message = if raw.is_null() { "could not open sqlite database".to_string() } else { db_error(raw) };
    if !raw.is_null() {
      unsafe { sqlite3_close(raw); }
    }
    return Err(message);
  }

  exec(raw, "PRAGMA journal_mode = WAL;")?;
  exec(raw, "PRAGMA synchronous = FULL;")?;
  exec(raw, "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT (unixepoch()));")?;
  Ok(Db { raw })
}

fn entry_count(db: *mut sqlite3) -> Result<i64, String> {
  let stmt = prepare(db, "SELECT COUNT(*) FROM kv;")?;
  let result = unsafe { sqlite3_step(stmt) };
  if result == SQLITE_ROW {
    let text = column_string(stmt, 0);
    unsafe { sqlite3_finalize(stmt); }
    return text.parse::<i64>().map_err(|_| "could not count vault entries".to_string());
  }
  let error = db_error(db);
  unsafe { sqlite3_finalize(stmt); }
  Err(error)
}

fn integrity_message(db: *mut sqlite3) -> Result<String, String> {
  let stmt = prepare(db, "PRAGMA integrity_check;")?;
  let result = unsafe { sqlite3_step(stmt) };
  if result == SQLITE_ROW {
    let message = column_string(stmt, 0);
    unsafe { sqlite3_finalize(stmt); }
    return Ok(message);
  }
  let error = db_error(db);
  unsafe { sqlite3_finalize(stmt); }
  Err(error)
}

fn file_size(path: &PathBuf) -> u64 {
  fs::metadata(path).map(|metadata| metadata.len()).unwrap_or(0)
}

fn modified_seconds(path: &PathBuf) -> u64 {
  fs::metadata(path)
    .and_then(|metadata| metadata.modified())
    .ok()
    .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
    .map(|duration| duration.as_secs())
    .unwrap_or(0)
}

fn prepare(db: *mut sqlite3, sql: &str) -> Result<*mut sqlite3_stmt, String> {
  let sql = cstring(sql)?;
  let mut stmt: *mut sqlite3_stmt = std::ptr::null_mut();
  let result = unsafe { sqlite3_prepare_v2(db, sql.as_ptr(), -1, &mut stmt, std::ptr::null_mut()) };
  if result == SQLITE_OK { Ok(stmt) } else { Err(db_error(db)) }
}

fn bind_text(stmt: *mut sqlite3_stmt, index: c_int, value: &str) -> Result<(), String> {
  let value = cstring(value)?;
  let result = unsafe {
    sqlite3_bind_text(stmt, index, value.as_ptr(), -1, sqlite_transient())
  };
  if result == SQLITE_OK { Ok(()) } else { Err("could not bind sqlite value".to_string()) }
}

#[tauri::command]
fn vault_read_all(app: tauri::AppHandle) -> Result<Vec<VaultEntry>, String> {
  let db = open_vault(&app)?;
  let stmt = prepare(db.raw, "SELECT key, value FROM kv ORDER BY key;")?;
  let mut entries = Vec::new();

  loop {
    let result = unsafe { sqlite3_step(stmt) };
    if result == SQLITE_ROW {
      let key = column_string(stmt, 0);
      let value = column_string(stmt, 1);
      entries.push(VaultEntry { key, value });
    } else if result == SQLITE_DONE {
      unsafe { sqlite3_finalize(stmt); }
      return Ok(entries);
    } else {
      let error = db_error(db.raw);
      unsafe { sqlite3_finalize(stmt); }
      return Err(error);
    }
  }
}

fn column_string(stmt: *mut sqlite3_stmt, column: c_int) -> String {
  unsafe {
    let ptr = sqlite3_column_text(stmt, column);
    if ptr.is_null() {
      return String::new();
    }
    let len = sqlite3_column_bytes(stmt, column).max(0) as usize;
    let bytes = std::slice::from_raw_parts(ptr as *const u8, len);
    String::from_utf8_lossy(bytes).into_owned()
  }
}

#[tauri::command]
fn vault_set_item(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
  let db = open_vault(&app)?;
  let stmt = prepare(
    db.raw,
    "INSERT INTO kv (key, value, updated_at) VALUES (?1, ?2, unixepoch()) \
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch();",
  )?;
  bind_text(stmt, 1, &key)?;
  bind_text(stmt, 2, &value)?;
  let result = unsafe { sqlite3_step(stmt) };
  unsafe { sqlite3_finalize(stmt); }
  if result == SQLITE_DONE { Ok(()) } else { Err(db_error(db.raw)) }
}

#[tauri::command]
fn vault_remove_item(app: tauri::AppHandle, key: String) -> Result<(), String> {
  let db = open_vault(&app)?;
  let stmt = prepare(db.raw, "DELETE FROM kv WHERE key = ?1;")?;
  bind_text(stmt, 1, &key)?;
  let result = unsafe { sqlite3_step(stmt) };
  unsafe { sqlite3_finalize(stmt); }
  if result == SQLITE_DONE { Ok(()) } else { Err(db_error(db.raw)) }
}

#[tauri::command]
fn vault_info(app: tauri::AppHandle) -> Result<VaultInfo, String> {
  let db = open_vault(&app)?;
  let path = vault_path(&app)?;
  let dir = vault_dir(&app)?;
  let backups = backup_dir(&app)?;
  let default_dir = app_default_dir(&app)?;
  let configured = configured_vault_dir(&app);
  let using_configured = configured.as_deref() == Some(dir.as_path());
  let wal_path = PathBuf::from(format!("{}-wal", path.to_string_lossy()));
  Ok(VaultInfo {
    vault_path: path.to_string_lossy().into_owned(),
    vault_dir: dir.to_string_lossy().into_owned(),
    backup_dir: backups.to_string_lossy().into_owned(),
    default_dir: default_dir.to_string_lossy().into_owned(),
    configured_dir: configured.map(|value| value.to_string_lossy().into_owned()),
    using_configured,
    exists: path.exists(),
    size_bytes: file_size(&path),
    wal_size_bytes: file_size(&wal_path),
    entry_count: entry_count(db.raw)?,
  })
}

// Move the vault to a user-chosen folder, or adopt an existing vault found
// there. The original vault.db is deliberately left in place as a safety copy.
#[tauri::command]
async fn vault_relocate(app: tauri::AppHandle) -> Result<Option<VaultRelocateResult>, String> {
  use tauri_plugin_dialog::DialogExt;

  let (tx, rx) = std::sync::mpsc::channel();
  app.dialog().file().pick_folder(move |dir| {
    let _ = tx.send(dir);
  });
  let picked = tauri::async_runtime::spawn_blocking(move || rx.recv())
    .await
    .map_err(|error| format!("Could not wait for the folder dialog: {error}"))?
    .map_err(|error| format!("Folder dialog closed unexpectedly: {error}"))?;

  let Some(folder) = picked else { return Ok(None) };
  let target_dir = folder
    .into_path()
    .map_err(|error| format!("Could not resolve the chosen folder: {error}"))?;

  let current_dir = vault_dir(&app)?;
  let current_path = vault_path(&app)?;
  if target_dir == current_dir {
    return Err("The vault already lives in that folder.".to_string());
  }
  fs::create_dir_all(&target_dir)
    .map_err(|error| format!("Could not use the chosen folder: {error}"))?;

  let target_path = target_dir.join("vault.db");
  let mode = if target_path.exists() {
    "adopted"
  } else {
    if current_path.exists() {
      {
        let db = open_vault(&app)?;
        exec(db.raw, "PRAGMA wal_checkpoint(FULL);")?;
      }
      fs::copy(&current_path, &target_path)
        .map_err(|error| format!("Could not copy the vault to the chosen folder: {error}"))?;
    }
    "moved"
  };

  write_vault_location_config(&app, &target_dir)?;

  Ok(Some(VaultRelocateResult {
    mode: mode.to_string(),
    vault_dir: target_dir.to_string_lossy().into_owned(),
    vault_path: target_path.to_string_lossy().into_owned(),
    previous_vault_path: current_path.to_string_lossy().into_owned(),
  }))
}

#[tauri::command]
fn vault_integrity_status(app: tauri::AppHandle) -> Result<VaultIntegrityStatus, String> {
  let db = open_vault(&app)?;
  let message = integrity_message(db.raw)?;
  let latest_snapshot = vault_list_snapshots(app.clone())?.into_iter().next();
  Ok(VaultIntegrityStatus {
    ok: message == "ok",
    message,
    latest_snapshot,
  })
}

#[tauri::command]
fn vault_create_snapshot(app: tauri::AppHandle) -> Result<VaultSnapshot, String> {
  create_vault_snapshot(&app, "vault-snapshot")
}

#[tauri::command]
fn vault_create_auto_snapshot(app: tauri::AppHandle) -> Result<Option<VaultSnapshot>, String> {
  maybe_create_auto_snapshot(&app)
}

fn create_vault_snapshot(app: &tauri::AppHandle, prefix: &str) -> Result<VaultSnapshot, String> {
  let db = open_vault(&app)?;
  exec(db.raw, "PRAGMA wal_checkpoint(FULL);")?;

  let source = vault_path(app)?;
  let backups = backup_dir(app)?;
  let timestamp = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map_err(|error| format!("Could not create snapshot timestamp: {error}"))?
    .as_secs();
  let name = format!("{prefix}-{timestamp}.db");
  let target = backups.join(&name);
  fs::copy(&source, &target).map_err(|error| format!("Could not create vault snapshot: {error}"))?;

  Ok(VaultSnapshot {
    name,
    path: target.to_string_lossy().into_owned(),
    size_bytes: file_size(&target),
    modified_seconds: modified_seconds(&target),
  })
}

fn maybe_create_auto_snapshot(app: &tauri::AppHandle) -> Result<Option<VaultSnapshot>, String> {
  let now = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map_err(|error| format!("Could not read system time: {error}"))?
    .as_secs();
  let latest_auto = list_snapshots_with_prefix(app, "vault-auto-")?
    .into_iter()
    .next()
    .map(|snapshot| snapshot.modified_seconds)
    .unwrap_or(0);

  if latest_auto > 0 && now.saturating_sub(latest_auto) < AUTO_SNAPSHOT_MIN_INTERVAL_SECONDS {
    return Ok(None);
  }

  let snapshot = create_vault_snapshot(app, "vault-auto")?;
  prune_auto_snapshots(app)?;
  Ok(Some(snapshot))
}

fn list_snapshots_with_prefix(app: &tauri::AppHandle, prefix: &str) -> Result<Vec<VaultSnapshot>, String> {
  let backups = backup_dir(app)?;
  let mut snapshots = Vec::new();
  for entry in fs::read_dir(&backups).map_err(|error| format!("Could not read backup directory: {error}"))? {
    let entry = entry.map_err(|error| format!("Could not read backup entry: {error}"))?;
    let path = entry.path();
    if !path.is_file() {
      continue;
    }
    let Some(name) = path.file_name().and_then(|file_name| file_name.to_str()) else {
      continue;
    };
    if !name.starts_with(prefix) || !name.ends_with(".db") {
      continue;
    }
    snapshots.push(VaultSnapshot {
      name: name.to_string(),
      path: path.to_string_lossy().into_owned(),
      size_bytes: file_size(&path),
      modified_seconds: modified_seconds(&path),
    });
  }
  snapshots.sort_by(|a, b| b.modified_seconds.cmp(&a.modified_seconds));
  Ok(snapshots)
}

fn prune_auto_snapshots(app: &tauri::AppHandle) -> Result<(), String> {
  let snapshots = list_snapshots_with_prefix(app, "vault-auto-")?;
  for snapshot in snapshots.into_iter().skip(AUTO_SNAPSHOT_RETENTION) {
    let path = backup_dir(app)?.join(snapshot.name);
    if path.exists() {
      fs::remove_file(&path).map_err(|error| format!("Could not prune old automatic snapshot: {error}"))?;
    }
  }
  Ok(())
}

// The desktop webview cannot navigate to external sites; marketing/upgrade
// links open in the user's default browser instead. https-only by design.
#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
  if !url.starts_with("https://") {
    return Err("Only https links can be opened.".to_string());
  }
  let status = Command::new("open")
    .arg(&url)
    .status()
    .map_err(|error| format!("Could not open the link: {error}"))?;
  if status.success() { Ok(()) } else { Err("The link could not be opened.".to_string()) }
}

#[tauri::command]
fn vault_reveal_in_finder(app: tauri::AppHandle) -> Result<(), String> {
  let path = vault_path(&app)?;
  let status = Command::new("open")
    .arg("-R")
    .arg(path)
    .status()
    .map_err(|error| format!("Could not ask Finder to reveal the vault: {error}"))?;
  if status.success() { Ok(()) } else { Err("Finder could not reveal the vault.".to_string()) }
}

#[tauri::command]
fn vault_list_snapshots(app: tauri::AppHandle) -> Result<Vec<VaultSnapshot>, String> {
  let backups = backup_dir(&app)?;
  let mut snapshots = Vec::new();
  for entry in fs::read_dir(&backups).map_err(|error| format!("Could not read backup directory: {error}"))? {
    let entry = entry.map_err(|error| format!("Could not read backup entry: {error}"))?;
    let path = entry.path();
    if !path.is_file() {
      continue;
    }
    let Some(name) = path.file_name().and_then(|file_name| file_name.to_str()) else {
      continue;
    };
    if !(name.starts_with("vault-snapshot-") || name.starts_with("vault-auto-") || name.starts_with("vault-before-restore-")) || !name.ends_with(".db") {
      continue;
    }
    snapshots.push(VaultSnapshot {
      name: name.to_string(),
      path: path.to_string_lossy().into_owned(),
      size_bytes: file_size(&path),
      modified_seconds: modified_seconds(&path),
    });
  }
  snapshots.sort_by(|a, b| b.modified_seconds.cmp(&a.modified_seconds));
  Ok(snapshots)
}

fn snapshot_path_for_restore(app: &tauri::AppHandle, name: &str) -> Result<PathBuf, String> {
  if name.contains('/') || name.contains('\\') || name.contains("..") {
    return Err("Invalid snapshot name.".to_string());
  }
  if !(name.starts_with("vault-snapshot-") || name.starts_with("vault-auto-") || name.starts_with("vault-before-restore-")) || !name.ends_with(".db") {
    return Err("Invalid snapshot file.".to_string());
  }
  let path = backup_dir(app)?.join(name);
  if !path.is_file() {
    return Err("Snapshot could not be found.".to_string());
  }
  Ok(path)
}

#[tauri::command]
fn vault_restore_snapshot(app: tauri::AppHandle, name: String) -> Result<VaultRestoreResult, String> {
  let snapshot = snapshot_path_for_restore(&app, &name)?;
  let safety = create_vault_snapshot(&app, "vault-before-restore")?;
  let target = vault_path(&app)?;
  let wal_path = PathBuf::from(format!("{}-wal", target.to_string_lossy()));
  let shm_path = PathBuf::from(format!("{}-shm", target.to_string_lossy()));

  fs::copy(&snapshot, &target).map_err(|error| format!("Could not restore vault snapshot: {error}"))?;
  if wal_path.exists() {
    let _ = fs::remove_file(&wal_path);
  }
  if shm_path.exists() {
    let _ = fs::remove_file(&shm_path);
  }

  Ok(VaultRestoreResult {
    restored_path: snapshot.to_string_lossy().into_owned(),
    safety_snapshot_path: safety.path,
  })
}

// Blob downloads via anchor clicks do nothing in the desktop webview, so
// exports (ZIP/DOCX/PDF/PNG) hand their bytes to this command, which shows a
// native save dialog and writes the file. Returns the saved path, or None if
// the user cancelled.
#[tauri::command]
async fn export_save_file(app: tauri::AppHandle, file_name: String, bytes: Vec<u8>) -> Result<Option<String>, String> {
  use tauri_plugin_dialog::DialogExt;

  let (tx, rx) = std::sync::mpsc::channel();
  app
    .dialog()
    .file()
    .set_file_name(&file_name)
    .save_file(move |path| {
      let _ = tx.send(path);
    });

  let picked = tauri::async_runtime::spawn_blocking(move || rx.recv())
    .await
    .map_err(|error| format!("Could not wait for the save dialog: {error}"))?
    .map_err(|error| format!("Save dialog closed unexpectedly: {error}"))?;

  let Some(file_path) = picked else { return Ok(None) };
  let path = file_path
    .into_path()
    .map_err(|error| format!("Could not resolve the chosen save location: {error}"))?;
  fs::write(&path, &bytes).map_err(|error| format!("Could not save the file: {error}"))?;
  Ok(Some(path.to_string_lossy().into_owned()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .invoke_handler(tauri::generate_handler![
      export_save_file,
      open_external_url,
      vault_relocate,
      vault_read_all,
      vault_set_item,
      vault_remove_item,
      vault_info,
      vault_integrity_status,
      vault_create_snapshot,
      vault_create_auto_snapshot,
      vault_reveal_in_finder,
      vault_list_snapshots,
      vault_restore_snapshot,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
