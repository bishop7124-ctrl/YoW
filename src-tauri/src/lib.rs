use serde::Serialize;
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

#[link(name = "sqlite3")]
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
  exists: bool,
  size_bytes: u64,
  wal_size_bytes: u64,
  entry_count: i64,
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

fn vault_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|error| format!("Could not locate app data directory: {error}"))?;
  fs::create_dir_all(&dir).map_err(|error| format!("Could not create vault directory: {error}"))?;
  Ok(dir)
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
  let wal_path = PathBuf::from(format!("{}-wal", path.to_string_lossy()));
  Ok(VaultInfo {
    vault_path: path.to_string_lossy().into_owned(),
    vault_dir: dir.to_string_lossy().into_owned(),
    backup_dir: backups.to_string_lossy().into_owned(),
    exists: path.exists(),
    size_bytes: file_size(&path),
    wal_size_bytes: file_size(&wal_path),
    entry_count: entry_count(db.raw)?,
  })
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
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
