use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::ffi::{CStr, CString};
use std::fs;
use std::os::raw::{c_char, c_int, c_void};
use std::path::{Path, PathBuf};
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
    callback: Option<
      unsafe extern "C" fn(*mut c_void, c_int, *mut *mut c_char, *mut *mut c_char) -> c_int,
    >,
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
  fn sqlite3_changes(db: *mut sqlite3) -> c_int;
}

#[derive(Deserialize, Serialize)]
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
  auto_snapshot_retention: usize,
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
    unsafe {
      sqlite3_close(self.raw);
    }
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
  if dir.as_os_str().is_empty() {
    None
  } else {
    Some(dir)
  }
}

fn write_vault_location_config(app: &tauri::AppHandle, dir: &Path) -> Result<(), String> {
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
  let active_dir = vault_dir(app)?;
  let dir = active_dir.join("Backups");
  fs::create_dir_all(&dir)
    .map_err(|error| format!("Could not create backup directory: {error}"))?;
  let default_dir = app_default_dir(app)?;
  if active_dir != default_dir {
    copy_backup_files(&default_dir.join("Backups"), &dir)?;
  }
  Ok(dir)
}

fn exec(db: *mut sqlite3, sql: &str) -> Result<(), String> {
  let sql = cstring(sql)?;
  let result = unsafe {
    sqlite3_exec(
      db,
      sql.as_ptr(),
      None,
      std::ptr::null_mut(),
      std::ptr::null_mut(),
    )
  };
  if result == SQLITE_OK {
    Ok(())
  } else {
    Err(db_error(db))
  }
}

// Opens any SQLite file at `path` with this app's standard vault pragmas/
// schema — the live vault.db and every snapshot/backup copy of it share the
// same on-disk shape (a snapshot is a raw `fs::copy()` of vault.db, see
// `create_vault_snapshot`), so this one helper serves both `open_vault` (the
// live vault) and the snapshot-scoped commands below (arbitrary backup
// files) without duplicating the open/pragma/schema sequence. Also split out
// so the FFI/SQL layer can be exercised directly in unit tests against a
// temp-file path, without a running Tauri AppHandle.
fn open_db(path: &Path) -> Result<Db, String> {
  let path = cstring(&path.to_string_lossy())?;
  let mut raw: *mut sqlite3 = std::ptr::null_mut();
  let result = unsafe { sqlite3_open(path.as_ptr(), &mut raw) };
  if result != SQLITE_OK {
    let message = if raw.is_null() {
      "could not open sqlite database".to_string()
    } else {
      db_error(raw)
    };
    if !raw.is_null() {
      unsafe {
        sqlite3_close(raw);
      }
    }
    return Err(message);
  }

  exec(raw, "PRAGMA journal_mode = WAL;")?;
  exec(raw, "PRAGMA synchronous = FULL;")?;
  exec(raw, "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT (unixepoch()));")?;
  Ok(Db { raw })
}

fn open_vault(app: &tauri::AppHandle) -> Result<Db, String> {
  open_db(&vault_path(app)?)
}

fn entry_count(db: *mut sqlite3) -> Result<i64, String> {
  let stmt = prepare(db, "SELECT COUNT(*) FROM kv;")?;
  let result = unsafe { sqlite3_step(stmt) };
  if result == SQLITE_ROW {
    let text = column_string(stmt, 0);
    unsafe {
      sqlite3_finalize(stmt);
    }
    return text
      .parse::<i64>()
      .map_err(|_| "could not count vault entries".to_string());
  }
  let error = db_error(db);
  unsafe {
    sqlite3_finalize(stmt);
  }
  Err(error)
}

fn integrity_message(db: *mut sqlite3) -> Result<String, String> {
  let stmt = prepare(db, "PRAGMA integrity_check;")?;
  let result = unsafe { sqlite3_step(stmt) };
  if result == SQLITE_ROW {
    let message = column_string(stmt, 0);
    unsafe {
      sqlite3_finalize(stmt);
    }
    return Ok(message);
  }
  let error = db_error(db);
  unsafe {
    sqlite3_finalize(stmt);
  }
  Err(error)
}

fn file_size(path: &PathBuf) -> u64 {
  fs::metadata(path)
    .map(|metadata| metadata.len())
    .unwrap_or(0)
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
  if result == SQLITE_OK {
    Ok(stmt)
  } else {
    Err(db_error(db))
  }
}

fn bind_text(stmt: *mut sqlite3_stmt, index: c_int, value: &str) -> Result<(), String> {
  let value = cstring(value)?;
  let result = unsafe { sqlite3_bind_text(stmt, index, value.as_ptr(), -1, sqlite_transient()) };
  if result == SQLITE_OK {
    Ok(())
  } else {
    Err("could not bind sqlite value".to_string())
  }
}

#[tauri::command]
fn vault_read_all(app: tauri::AppHandle) -> Result<Vec<VaultEntry>, String> {
  let db = open_vault(&app)?;
  read_all_entries(db.raw)
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
  set_vault_item(&db, &key, &value)
}

fn set_vault_item(db: &Db, key: &str, value: &str) -> Result<(), String> {
  let stmt = prepare(
    db.raw,
    "INSERT INTO kv (key, value, updated_at) VALUES (?1, ?2, unixepoch()) \
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch();",
  )?;
  bind_text(stmt, 1, key)?;
  bind_text(stmt, 2, value)?;
  let result = unsafe { sqlite3_step(stmt) };
  unsafe {
    sqlite3_finalize(stmt);
  }
  if result == SQLITE_DONE {
    Ok(())
  } else {
    Err(db_error(db.raw))
  }
}

#[tauri::command]
fn vault_remove_item(app: tauri::AppHandle, key: String) -> Result<(), String> {
  let db = open_vault(&app)?;
  remove_vault_item(&db, &key)
}

fn remove_vault_item(db: &Db, key: &str) -> Result<(), String> {
  let stmt = prepare(db.raw, "DELETE FROM kv WHERE key = ?1;")?;
  bind_text(stmt, 1, key)?;
  let result = unsafe { sqlite3_step(stmt) };
  unsafe {
    sqlite3_finalize(stmt);
  }
  if result == SQLITE_DONE {
    Ok(())
  } else {
    Err(db_error(db.raw))
  }
}

fn replace_vault_items(
  db: &Db,
  entries: &[VaultEntry],
  remove_keys: &[String],
) -> Result<(), String> {
  exec(db.raw, "BEGIN IMMEDIATE;")?;
  let result = (|| {
    for key in remove_keys {
      remove_vault_item(db, key)?;
    }
    for entry in entries {
      set_vault_item(db, &entry.key, &entry.value)?;
    }
    Ok(())
  })();

  match result {
    Ok(()) => exec(db.raw, "COMMIT;"),
    Err(error) => {
      let _ = exec(db.raw, "ROLLBACK;");
      Err(error)
    }
  }
}

#[tauri::command]
fn vault_replace_items(
  app: tauri::AppHandle,
  entries: Vec<VaultEntry>,
  remove_keys: Vec<String>,
) -> Result<(), String> {
  let db = open_vault(&app)?;
  replace_vault_items(&db, &entries, &remove_keys)
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
    auto_snapshot_retention: AUTO_SNAPSHOT_RETENTION,
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

  let Some(folder) = picked else {
    return Ok(None);
  };
  let target_dir = folder
    .into_path()
    .map_err(|error| format!("Could not resolve the chosen folder: {error}"))?;

  let current_dir = vault_dir(&app)?;
  let current_path = vault_path(&app)?;
  let current_backup_dir = backup_dir(&app)?;
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
      copy_backup_files(&current_backup_dir, &target_dir.join("Backups"))?;
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
  let db = open_vault(app)?;
  exec(db.raw, "PRAGMA wal_checkpoint(FULL);")?;

  let source = vault_path(app)?;
  let backups = backup_dir(app)?;
  let timestamp = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map_err(|error| format!("Could not create snapshot timestamp: {error}"))?
    .as_secs();
  let name = format!("{prefix}-{timestamp}.db");
  let target = backups.join(&name);
  fs::copy(&source, &target)
    .map_err(|error| format!("Could not create vault snapshot: {error}"))?;

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

fn list_snapshots_with_prefix(
  app: &tauri::AppHandle,
  prefix: &str,
) -> Result<Vec<VaultSnapshot>, String> {
  let backups = backup_dir(app)?;
  let mut snapshots = Vec::new();
  collect_snapshots_from_dir(&backups, Some(prefix), &mut HashSet::new(), &mut snapshots)?;
  snapshots.sort_by_key(|snapshot| std::cmp::Reverse(snapshot.modified_seconds));
  Ok(snapshots)
}

fn collect_snapshots_from_dir(
  backups: &PathBuf,
  prefix: Option<&str>,
  seen: &mut HashSet<String>,
  snapshots: &mut Vec<VaultSnapshot>,
) -> Result<(), String> {
  if !backups.is_dir() {
    return Ok(());
  }
  for entry in
    fs::read_dir(backups).map_err(|error| format!("Could not read backup directory: {error}"))?
  {
    let entry = entry.map_err(|error| format!("Could not read backup entry: {error}"))?;
    let path = entry.path();
    if !path.is_file() {
      continue;
    }
    let Some(name) = path.file_name().and_then(|file_name| file_name.to_str()) else {
      continue;
    };
    if prefix
      .map(|value| !name.starts_with(value))
      .unwrap_or(false)
      || !is_restorable_snapshot_name(name)
    {
      continue;
    }
    if !seen.insert(name.to_string()) {
      continue;
    }
    snapshots.push(VaultSnapshot {
      name: name.to_string(),
      path: path.to_string_lossy().into_owned(),
      size_bytes: file_size(&path),
      modified_seconds: modified_seconds(&path),
    });
  }
  Ok(())
}

fn prune_auto_snapshots(app: &tauri::AppHandle) -> Result<(), String> {
  let snapshots = list_snapshots_with_prefix(app, "vault-auto-")?;
  for snapshot in snapshots.into_iter().skip(AUTO_SNAPSHOT_RETENTION) {
    let path = backup_dir(app)?.join(snapshot.name);
    if path.exists() {
      fs::remove_file(&path)
        .map_err(|error| format!("Could not prune old automatic snapshot: {error}"))?;
    }
  }
  Ok(())
}

fn copy_backup_files(source_dir: &PathBuf, target_dir: &PathBuf) -> Result<(), String> {
  if !source_dir.is_dir() {
    return Ok(());
  }
  fs::create_dir_all(target_dir)
    .map_err(|error| format!("Could not create backup directory: {error}"))?;
  for entry in
    fs::read_dir(source_dir).map_err(|error| format!("Could not read backup directory: {error}"))?
  {
    let entry = entry.map_err(|error| format!("Could not read backup entry: {error}"))?;
    let source = entry.path();
    if !source.is_file() {
      continue;
    }
    let Some(name) = source.file_name() else {
      continue;
    };
    let target = target_dir.join(name);
    if target.exists() {
      continue;
    }
    fs::copy(&source, &target)
      .map_err(|error| format!("Could not copy vault snapshot: {error}"))?;
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
  spawn_opener(&url)
}

#[tauri::command]
fn vault_reveal_in_finder(app: tauri::AppHandle) -> Result<(), String> {
  let path = vault_path(&app)?;
  reveal_path(&path)
}

// Opens a URL with the OS's registered default handler. Previously always
// shelled out to macOS's `open`, which silently does nothing on Windows/
// Linux (audit finding #27) — YOW ships on all three (bundle.targets =
// "all" in tauri.conf.json).
fn spawn_opener(url: &str) -> Result<(), String> {
  if cfg!(target_os = "macos") {
    let status = Command::new("open")
      .arg(url)
      .status()
      .map_err(|error| format!("Could not open the link: {error}"))?;
    return if status.success() {
      Ok(())
    } else {
      Err("The link could not be opened.".to_string())
    };
  }
  if cfg!(target_os = "windows") {
    // explorer.exe can report a nonzero exit code on a genuine success (a
    // long-documented Windows quirk) — a successful spawn is treated as
    // success rather than trusting its exit code.
    Command::new("explorer")
      .arg(url)
      .spawn()
      .map_err(|error| format!("Could not open the link: {error}"))?;
    return Ok(());
  }
  let status = Command::new("xdg-open")
    .arg(url)
    .status()
    .map_err(|error| format!("Could not open the link: {error}"))?;
  if status.success() {
    Ok(())
  } else {
    Err("The link could not be opened.".to_string())
  }
}

// Reveals (selects, where the platform supports it) a file in the system
// file manager. Previously always shelled out to macOS's `open -R`, which
// silently does nothing on Windows/Linux (audit finding #27).
fn reveal_path(path: &std::path::Path) -> Result<(), String> {
  if cfg!(target_os = "macos") {
    let status = Command::new("open")
      .arg("-R")
      .arg(path)
      .status()
      .map_err(|error| format!("Could not ask Finder to reveal the vault: {error}"))?;
    return if status.success() {
      Ok(())
    } else {
      Err("Finder could not reveal the vault.".to_string())
    };
  }
  if cfg!(target_os = "windows") {
    let mut arg = std::ffi::OsString::from("/select,");
    arg.push(path.as_os_str());
    Command::new("explorer")
      .arg(arg)
      .spawn()
      .map_err(|error| format!("Could not ask Explorer to reveal the vault: {error}"))?;
    return Ok(());
  }
  // Linux has no universal "select in file manager" primitive across
  // desktop environments — fall back to opening the containing folder (the
  // vault file itself isn't pre-selected/highlighted).
  let parent = path.parent().unwrap_or(path);
  let status = Command::new("xdg-open")
    .arg(parent)
    .status()
    .map_err(|error| format!("Could not open the vault folder: {error}"))?;
  if status.success() {
    Ok(())
  } else {
    Err("The file manager could not open the vault folder.".to_string())
  }
}

#[tauri::command]
fn vault_list_snapshots(app: tauri::AppHandle) -> Result<Vec<VaultSnapshot>, String> {
  let backups = backup_dir(&app)?;
  let default_backups = app_default_dir(&app)?.join("Backups");
  let mut seen = HashSet::new();
  let mut snapshots = Vec::new();
  collect_snapshots_from_dir(&backups, None, &mut seen, &mut snapshots)?;
  if default_backups != backups {
    collect_snapshots_from_dir(&default_backups, None, &mut seen, &mut snapshots)?;
  }
  snapshots.sort_by_key(|snapshot| std::cmp::Reverse(snapshot.modified_seconds));
  Ok(snapshots)
}

fn is_restorable_snapshot_name(name: &str) -> bool {
  (name.starts_with("vault-snapshot-")
    || name.starts_with("vault-auto-")
    || name.starts_with("vault-before-restore-"))
    && name.ends_with(".db")
}

fn validate_snapshot_path(path: &Path) -> Result<PathBuf, String> {
  if !path.is_file() {
    return Err(
      "Snapshot could not be found. It may have been moved or deleted outside YOW.".to_string(),
    );
  }
  let Some(name) = path.file_name().and_then(|file_name| file_name.to_str()) else {
    return Err("Invalid snapshot file.".to_string());
  };
  if !is_restorable_snapshot_name(name) {
    return Err("Invalid snapshot file.".to_string());
  }
  let Some(parent) = path.parent() else {
    return Err("Invalid snapshot location.".to_string());
  };
  if parent.file_name().and_then(|file_name| file_name.to_str()) != Some("Backups") {
    return Err("Invalid snapshot location.".to_string());
  }
  let Some(vault_dir) = parent.parent() else {
    return Err("Invalid snapshot location.".to_string());
  };
  if !vault_dir.join("vault.db").is_file() {
    return Err("Invalid snapshot location.".to_string());
  }
  Ok(path.to_path_buf())
}

// Shared by every by-name snapshot lookup below, so a future tightening of
// the traversal/shape checks can't be applied to one lookup and forgotten on
// another.
fn validate_snapshot_name(name: &str) -> Result<(), String> {
  if name.contains("..") {
    return Err("Invalid snapshot name.".to_string());
  }
  if !is_restorable_snapshot_name(name) {
    return Err("Invalid snapshot file.".to_string());
  }
  Ok(())
}

fn snapshot_path_for_restore(app: &tauri::AppHandle, name: &str) -> Result<PathBuf, String> {
  if name.contains('/') || name.contains('\\') {
    return validate_snapshot_path(&PathBuf::from(name));
  }
  validate_snapshot_name(name)?;
  let backups = backup_dir(app)?;
  let path = backups.join(name);
  if path.is_file() {
    return Ok(path);
  }

  let default_path = app_default_dir(app)?.join("Backups").join(name);
  if default_path.is_file() {
    let copied_path = backups.join(name);
    if !copied_path.is_file() {
      fs::copy(&default_path, &copied_path)
        .map_err(|error| format!("Could not copy vault snapshot: {error}"))?;
    }
    return Ok(copied_path);
  }

  Err("Snapshot could not be found. It may have been moved or deleted outside YOW.".to_string())
}

// Like `snapshot_path_for_restore`, but never copies the file, and returns
// EVERY existing physical copy of `name` instead of just one. A scrub must
// modify every on-disk copy it finds: `vault_relocate` moves the *live*
// vault but only ever *copies* backup files into the new location
// (`backup_dir`'s own `copy_backup_files` call, which skips a target that
// already exists rather than ever deleting a source) — so a relocated
// install can easily have two independent, identically-named copies of the
// same pre-fix leaking snapshot, one in the active Backups directory and
// one still sitting in the original default app-data directory. Resolving
// to only the first one found (as `snapshot_path_for_restore` deliberately
// does, for its own copy-on-read restore semantics) would leave that second
// copy leaking indefinitely. Used only by the snapshot-scoped read/scrub
// commands below, never by restore.
fn resolve_existing_snapshot_paths(
  app: &tauri::AppHandle,
  name: &str,
) -> Result<Vec<PathBuf>, String> {
  if name.contains('/') || name.contains('\\') {
    return Ok(vec![validate_snapshot_path(&PathBuf::from(name))?]);
  }
  validate_snapshot_name(name)?;

  let mut paths = Vec::new();
  let active_path = backup_dir(app)?.join(name);
  if active_path.is_file() {
    paths.push(active_path.clone());
  }
  let default_path = app_default_dir(app)?.join("Backups").join(name);
  if default_path.is_file() && default_path != active_path {
    paths.push(default_path);
  }
  if paths.is_empty() {
    return Err(
      "Snapshot could not be found. It may have been moved or deleted outside YOW.".to_string(),
    );
  }
  Ok(paths)
}

// Shared by vault_read_all and vault_snapshot_read_all so the two read paths
// (live vault vs. an arbitrary backup file) can't silently diverge.
fn read_all_entries(db: *mut sqlite3) -> Result<Vec<VaultEntry>, String> {
  let stmt = prepare(db, "SELECT key, value FROM kv ORDER BY key;")?;
  let mut entries = Vec::new();

  loop {
    let result = unsafe { sqlite3_step(stmt) };
    if result == SQLITE_ROW {
      let key = column_string(stmt, 0);
      let value = column_string(stmt, 1);
      entries.push(VaultEntry { key, value });
    } else if result == SQLITE_DONE {
      unsafe {
        sqlite3_finalize(stmt);
      }
      return Ok(entries);
    } else {
      let error = db_error(db);
      unsafe {
        sqlite3_finalize(stmt);
      }
      return Err(error);
    }
  }
}

// Reads every entry from every existing physical copy of a snapshot/backup
// file's own `kv` table — same shape as `vault_read_all`, but against an
// arbitrary backup name (which, per `resolve_existing_snapshot_paths` above,
// can resolve to more than one file) instead of the single live vault. Used
// by the JS-side scrub (audit finding P0-10 follow-up) to find which
// secrets, if any, a given snapshot name still carries anywhere on disk; the
// sensitive-key predicate itself stays in `tauriVaultAdapter.js`'s
// `isSensitiveStorageKey()` (the single source of truth already used for the
// live vault) rather than being duplicated here. Entries are merged by key
// across copies (last write wins) since same-named copies are expected to be
// identical anyway — this is only ever used to decide *which keys* to scrub,
// not to distinguish the copies from each other.
#[tauri::command]
fn vault_snapshot_read_all(app: tauri::AppHandle, name: String) -> Result<Vec<VaultEntry>, String> {
  let paths = resolve_existing_snapshot_paths(&app, &name)?;
  let mut merged: std::collections::HashMap<String, String> = std::collections::HashMap::new();
  for path in &paths {
    let db = open_db(path)?;
    for entry in read_all_entries(db.raw)? {
      merged.insert(entry.key, entry.value);
    }
  }
  let mut entries: Vec<VaultEntry> = merged
    .into_iter()
    .map(|(key, value)| VaultEntry { key, value })
    .collect();
  entries.sort_by(|a, b| a.key.cmp(&b.key));
  Ok(entries)
}

// Deletes `keys` from every existing physical copy of a snapshot/backup
// file's `kv` table in place. Companion to `vault_snapshot_read_all`:
// together these let the JS layer scrub secrets (audit finding P0-10) out of
// pre-fix backup copies the same way `scrubSensitiveVaultEntries` already
// scrubs the live vault, without duplicating the sensitive-key predicate
// into Rust. Returns how many rows were actually removed across all copies,
// so a snapshot with none of the given keys present is distinguishable from
// a real failure.
#[tauri::command]
fn vault_snapshot_remove_keys(
  app: tauri::AppHandle,
  name: String,
  keys: Vec<String>,
) -> Result<u32, String> {
  let paths = resolve_existing_snapshot_paths(&app, &name)?;
  let mut removed: u32 = 0;
  for path in &paths {
    let db = open_db(path)?;
    for key in &keys {
      let stmt = prepare(db.raw, "DELETE FROM kv WHERE key = ?1;")?;
      if let Err(error) = bind_text(stmt, 1, key) {
        unsafe {
          sqlite3_finalize(stmt);
        }
        return Err(error);
      }
      let result = unsafe { sqlite3_step(stmt) };
      unsafe {
        sqlite3_finalize(stmt);
      }
      if result != SQLITE_DONE {
        return Err(db_error(db.raw));
      }
      removed += unsafe { sqlite3_changes(db.raw) }.max(0) as u32;
    }
  }
  Ok(removed)
}

fn restore_vault_file(snapshot: &Path, target: &Path) -> Result<(), String> {
  let wal_path = PathBuf::from(format!("{}-wal", target.to_string_lossy()));
  let shm_path = PathBuf::from(format!("{}-shm", target.to_string_lossy()));

  fs::copy(snapshot, target)
    .map_err(|error| format!("Could not restore vault snapshot: {error}"))?;
  if wal_path.exists() {
    let _ = fs::remove_file(&wal_path);
  }
  if shm_path.exists() {
    let _ = fs::remove_file(&shm_path);
  }

  Ok(())
}

#[tauri::command]
fn vault_restore_snapshot(
  app: tauri::AppHandle,
  name: String,
) -> Result<VaultRestoreResult, String> {
  // AccountSettings already presents an accessible, in-app confirmation with
  // the selected snapshot and safety-copy consequences. A second blocking
  // native dialog here can open behind the webview on macOS and leave the UI
  // permanently waiting on "Restoring...".
  let snapshot = snapshot_path_for_restore(&app, &name)?;
  let safety = create_vault_snapshot(&app, "vault-before-restore")?;
  let target = vault_path(&app)?;
  restore_vault_file(&snapshot, &target)?;

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
async fn export_save_file(
  app: tauri::AppHandle,
  file_name: String,
  bytes: Vec<u8>,
) -> Result<Option<String>, String> {
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

  let Some(file_path) = picked else {
    return Ok(None);
  };
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
      vault_replace_items,
      vault_info,
      vault_integrity_status,
      vault_create_snapshot,
      vault_create_auto_snapshot,
      vault_reveal_in_finder,
      vault_list_snapshots,
      vault_restore_snapshot,
      vault_snapshot_read_all,
      vault_snapshot_remove_keys,
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

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs::File;

  // --- snapshot name/path safety ---

  #[test]
  fn is_restorable_snapshot_name_accepts_each_known_prefix() {
    assert!(is_restorable_snapshot_name("vault-snapshot-1700000000.db"));
    assert!(is_restorable_snapshot_name("vault-auto-1700000000.db"));
    assert!(is_restorable_snapshot_name(
      "vault-before-restore-1700000000.db"
    ));
  }

  #[test]
  fn is_restorable_snapshot_name_rejects_unknown_prefix_or_extension() {
    assert!(!is_restorable_snapshot_name("vault.db"));
    assert!(!is_restorable_snapshot_name("random-file.db"));
    assert!(!is_restorable_snapshot_name(
      "vault-snapshot-1700000000.txt"
    ));
    assert!(!is_restorable_snapshot_name(
      "vault-snapshot-1700000000.db.bak"
    ));
    assert!(!is_restorable_snapshot_name(""));
    // Path traversal disguised as a filename must not slip past the prefix/suffix check.
    assert!(!is_restorable_snapshot_name(
      "../vault-snapshot-1700000000.db"
    ));
  }

  #[test]
  fn validate_snapshot_path_accepts_a_real_snapshot_next_to_its_vault() {
    let root = tempfile::tempdir().expect("tempdir");
    let vault_dir = root.path().join("vault");
    let backups = vault_dir.join("Backups");
    fs::create_dir_all(&backups).unwrap();
    File::create(vault_dir.join("vault.db")).unwrap();
    let snapshot = backups.join("vault-snapshot-1700000000.db");
    File::create(&snapshot).unwrap();

    assert_eq!(validate_snapshot_path(&snapshot).unwrap(), snapshot);
  }

  #[test]
  fn validate_snapshot_path_rejects_missing_file() {
    let root = tempfile::tempdir().expect("tempdir");
    let missing = root
      .path()
      .join("Backups")
      .join("vault-snapshot-1700000000.db");
    assert!(validate_snapshot_path(&missing).is_err());
  }

  #[test]
  fn validate_snapshot_path_rejects_a_disallowed_filename() {
    let root = tempfile::tempdir().expect("tempdir");
    let backups = root.path().join("vault").join("Backups");
    fs::create_dir_all(&backups).unwrap();
    File::create(root.path().join("vault").join("vault.db")).unwrap();
    // Not a recognized snapshot name (e.g. an arbitrary file someone dropped in Backups/).
    let stray = backups.join("notes.txt");
    File::create(&stray).unwrap();
    assert!(validate_snapshot_path(&stray).is_err());
  }

  #[test]
  fn validate_snapshot_path_rejects_files_outside_a_backups_folder() {
    let root = tempfile::tempdir().expect("tempdir");
    // A validly-named snapshot file, but sitting directly in the vault dir,
    // not inside its Backups/ subfolder — must still be rejected.
    File::create(root.path().join("vault.db")).unwrap();
    let escaped = root.path().join("vault-snapshot-1700000000.db");
    File::create(&escaped).unwrap();
    assert!(validate_snapshot_path(&escaped).is_err());
  }

  #[test]
  fn validate_snapshot_path_rejects_a_backups_folder_with_no_sibling_vault() {
    let root = tempfile::tempdir().expect("tempdir");
    // Backups/ exists and the file name is well-formed, but there is no
    // vault.db beside it — this should not be treated as a real vault's
    // snapshot (guards against pointing the restore flow at an arbitrary
    // attacker-controlled directory that merely mimics the shape).
    let backups = root.path().join("Backups");
    fs::create_dir_all(&backups).unwrap();
    let snapshot = backups.join("vault-snapshot-1700000000.db");
    File::create(&snapshot).unwrap();
    assert!(validate_snapshot_path(&snapshot).is_err());
  }

  // --- cstring / FFI argument safety ---

  #[test]
  fn cstring_rejects_interior_nul_bytes() {
    assert!(cstring("safe value").is_ok());
    assert!(cstring("bad\0value").is_err());
  }

  // --- backup file copying ---

  #[test]
  fn copy_backup_files_is_a_noop_when_source_is_missing() {
    let root = tempfile::tempdir().expect("tempdir");
    let source = root.path().join("does-not-exist");
    let target = root.path().join("target");
    assert!(copy_backup_files(&source, &target).is_ok());
    assert!(!target.exists());
  }

  #[test]
  fn copy_backup_files_copies_new_files_but_never_overwrites_existing_ones() {
    let root = tempfile::tempdir().expect("tempdir");
    let source = root.path().join("source");
    let target = root.path().join("target");
    fs::create_dir_all(&source).unwrap();
    fs::create_dir_all(&target).unwrap();
    fs::create_dir_all(source.join("a-subdir")).unwrap(); // must be skipped, not copied

    fs::write(source.join("new.db"), b"new-bytes").unwrap();
    fs::write(source.join("existing.db"), b"source-version").unwrap();
    fs::write(target.join("existing.db"), b"target-version").unwrap();

    copy_backup_files(&source, &target).unwrap();

    assert_eq!(fs::read(target.join("new.db")).unwrap(), b"new-bytes");
    // Existing target file must be left exactly as it was, not clobbered by the source.
    assert_eq!(
      fs::read(target.join("existing.db")).unwrap(),
      b"target-version"
    );
    assert!(!target.join("a-subdir").exists());
  }

  // --- snapshot listing ---

  #[test]
  fn collect_snapshots_from_dir_filters_prefix_and_ignores_non_snapshot_files() {
    let root = tempfile::tempdir().expect("tempdir");
    let backups = root.path().join("Backups");
    fs::create_dir_all(&backups).unwrap();
    File::create(backups.join("vault-snapshot-100.db")).unwrap();
    File::create(backups.join("vault-auto-200.db")).unwrap();
    File::create(backups.join("random-notes.txt")).unwrap();
    fs::create_dir_all(backups.join("vault-snapshot-a-directory.db")).unwrap();

    let mut seen = HashSet::new();
    let mut snapshots = Vec::new();
    collect_snapshots_from_dir(&backups, Some("vault-auto-"), &mut seen, &mut snapshots).unwrap();

    assert_eq!(snapshots.len(), 1);
    assert_eq!(snapshots[0].name, "vault-auto-200.db");
  }

  #[test]
  fn collect_snapshots_from_dir_dedupes_via_the_seen_set() {
    let root = tempfile::tempdir().expect("tempdir");
    let backups = root.path().join("Backups");
    fs::create_dir_all(&backups).unwrap();
    File::create(backups.join("vault-snapshot-100.db")).unwrap();

    let mut seen = HashSet::new();
    let mut snapshots = Vec::new();
    collect_snapshots_from_dir(&backups, None, &mut seen, &mut snapshots).unwrap();
    // Same directory, scanned again into the same seen/snapshots accumulators
    // (mirrors vault_list_snapshots merging the active and default Backups dirs).
    collect_snapshots_from_dir(&backups, None, &mut seen, &mut snapshots).unwrap();

    assert_eq!(snapshots.len(), 1);
  }

  #[test]
  fn collect_snapshots_from_dir_is_a_noop_when_the_directory_does_not_exist() {
    let root = tempfile::tempdir().expect("tempdir");
    let missing = root.path().join("Backups");
    let mut seen = HashSet::new();
    let mut snapshots = Vec::new();
    assert!(collect_snapshots_from_dir(&missing, None, &mut seen, &mut snapshots).is_ok());
    assert!(snapshots.is_empty());
  }

  // --- low-level sqlite FFI layer (busy database, prepare/exec error paths, round-trip) ---

  fn set_item(db: &Db, key: &str, value: &str) -> Result<(), String> {
    let stmt = prepare(
      db.raw,
      "INSERT INTO kv (key, value, updated_at) VALUES (?1, ?2, unixepoch()) \
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch();",
    )?;
    bind_text(stmt, 1, key)?;
    bind_text(stmt, 2, value)?;
    let result = unsafe { sqlite3_step(stmt) };
    unsafe { sqlite3_finalize(stmt) };
    if result == SQLITE_DONE {
      Ok(())
    } else {
      Err(db_error(db.raw))
    }
  }

  fn get_item(db: &Db, key: &str) -> Result<Option<String>, String> {
    let stmt = prepare(db.raw, "SELECT value FROM kv WHERE key = ?1;")?;
    bind_text(stmt, 1, key)?;
    let result = unsafe { sqlite3_step(stmt) };
    let value = if result == SQLITE_ROW {
      Some(column_string(stmt, 0))
    } else {
      None
    };
    unsafe { sqlite3_finalize(stmt) };
    Ok(value)
  }

  #[test]
  fn open_db_creates_an_empty_kv_table() {
    let root = tempfile::tempdir().expect("tempdir");
    let db = open_db(&root.path().join("vault.db")).unwrap();
    assert_eq!(entry_count(db.raw).unwrap(), 0);
  }

  #[test]
  fn vault_set_and_read_round_trip_survives_a_reopen() {
    let root = tempfile::tempdir().expect("tempdir");
    let path = root.path().join("vault.db");
    {
      let db = open_db(&path).unwrap();
      set_item(&db, "title", "Chapter One").unwrap();
      set_item(&db, "title", "Chapter One, Revised").unwrap(); // upsert, not a duplicate row
      assert_eq!(entry_count(db.raw).unwrap(), 1);
    }
    // Reopen as a fresh connection, the way a later app launch would.
    let db = open_db(&path).unwrap();
    assert_eq!(
      get_item(&db, "title").unwrap(),
      Some("Chapter One, Revised".to_string())
    );
    assert_eq!(get_item(&db, "missing-key").unwrap(), None);
  }

  #[test]
  fn replace_vault_items_rolls_back_every_change_when_one_write_fails() {
    let root = tempfile::tempdir().expect("tempdir");
    let db = open_db(&root.path().join("vault.db")).unwrap();
    set_vault_item(&db, "existing", "original").unwrap();
    set_vault_item(&db, "stale", "keep on failure").unwrap();
    exec(
      db.raw,
      "CREATE TRIGGER reject_bad_key BEFORE INSERT ON kv WHEN NEW.key = 'bad' BEGIN SELECT RAISE(ABORT, 'injected failure'); END;",
    ).unwrap();

    let entries = vec![
      VaultEntry {
        key: "existing".to_string(),
        value: "replacement".to_string(),
      },
      VaultEntry {
        key: "bad".to_string(),
        value: "never commits".to_string(),
      },
    ];
    let result = replace_vault_items(&db, &entries, &["stale".to_string()]);

    assert!(result.is_err());
    assert_eq!(
      get_item(&db, "existing").unwrap(),
      Some("original".to_string())
    );
    assert_eq!(
      get_item(&db, "stale").unwrap(),
      Some("keep on failure".to_string())
    );
    assert_eq!(get_item(&db, "bad").unwrap(), None);
  }

  #[test]
  fn prepare_surfaces_a_sqlite_error_for_invalid_sql() {
    let root = tempfile::tempdir().expect("tempdir");
    let db = open_db(&root.path().join("vault.db")).unwrap();
    let result = prepare(db.raw, "SELECT this is not valid SQL;");
    assert!(result.is_err());
  }

  #[test]
  fn exec_surfaces_a_sqlite_error_for_an_unknown_table() {
    let root = tempfile::tempdir().expect("tempdir");
    let db = open_db(&root.path().join("vault.db")).unwrap();
    let result = exec(db.raw, "INSERT INTO does_not_exist (key) VALUES ('x');");
    assert!(result.is_err());
  }

  #[test]
  fn a_second_writer_gets_a_busy_error_while_the_first_holds_a_write_lock() {
    let root = tempfile::tempdir().expect("tempdir");
    let path = root.path().join("vault.db");
    let writer = open_db(&path).unwrap();
    // Acquire the single write lock SQLite allows (even under WAL) and hold it open.
    exec(writer.raw, "BEGIN IMMEDIATE;").unwrap();
    set_item(&writer, "held", "by-writer-one").unwrap();

    let contender = open_db(&path).unwrap();
    let result = set_item(&contender, "held", "by-writer-two");
    assert!(
      result.is_err(),
      "a concurrent writer must be rejected with SQLITE_BUSY, not silently succeed"
    );

    // Releasing the lock lets a subsequent write through, confirming the
    // failure above really was the busy-lock path and not something else.
    exec(writer.raw, "COMMIT;").unwrap();
    assert!(set_item(&contender, "held", "by-writer-two").is_ok());
  }

  #[test]
  fn snapshot_copy_preserves_full_vault_contents() {
    let root = tempfile::tempdir().expect("tempdir");
    let source_path = root.path().join("vault.db");
    {
      let db = open_db(&source_path).unwrap();
      set_item(&db, "characters", "[\"Rowan\",\"Sable\"]").unwrap();
      set_item(&db, "scene-1", "It was a dark and stormy night.").unwrap();
      exec(db.raw, "PRAGMA wal_checkpoint(FULL);").unwrap();
    }

    // Mirrors create_vault_snapshot's core step: checkpoint, then a plain file copy.
    let snapshot_path = root.path().join("vault-snapshot-1700000000.db");
    fs::copy(&source_path, &snapshot_path).unwrap();

    let snapshot_db = open_db(&snapshot_path).unwrap();
    assert_eq!(entry_count(snapshot_db.raw).unwrap(), 2);
    assert_eq!(
      get_item(&snapshot_db, "characters").unwrap(),
      Some("[\"Rowan\",\"Sable\"]".to_string())
    );
    assert_eq!(
      get_item(&snapshot_db, "scene-1").unwrap(),
      Some("It was a dark and stormy night.".to_string())
    );
    assert_eq!(integrity_message(snapshot_db.raw).unwrap(), "ok");
  }

  #[test]
  fn restore_vault_file_replaces_contents_and_removes_stale_wal_files() {
    let root = tempfile::tempdir().expect("tempdir");
    let target_path = root.path().join("vault.db");
    let snapshot_path = root.path().join("vault-snapshot-1700000000.db");

    {
      let target = open_db(&target_path).unwrap();
      set_item(&target, "project", "deleted-current-copy").unwrap();
      exec(target.raw, "PRAGMA wal_checkpoint(FULL);").unwrap();
    }
    {
      let snapshot = open_db(&snapshot_path).unwrap();
      set_item(&snapshot, "project", "restored-snapshot-copy").unwrap();
      set_item(&snapshot, "scene", "restored prose").unwrap();
      exec(snapshot.raw, "PRAGMA wal_checkpoint(FULL);").unwrap();
    }

    let wal_path = PathBuf::from(format!("{}-wal", target_path.to_string_lossy()));
    let shm_path = PathBuf::from(format!("{}-shm", target_path.to_string_lossy()));
    fs::write(&wal_path, b"stale wal").unwrap();
    fs::write(&shm_path, b"stale shm").unwrap();

    restore_vault_file(&snapshot_path, &target_path).unwrap();

    assert!(!wal_path.exists());
    assert!(!shm_path.exists());
    let restored = open_db(&target_path).unwrap();
    assert_eq!(entry_count(restored.raw).unwrap(), 2);
    assert_eq!(
      get_item(&restored, "project").unwrap(),
      Some("restored-snapshot-copy".to_string())
    );
    assert_eq!(
      get_item(&restored, "scene").unwrap(),
      Some("restored prose".to_string())
    );
    assert_eq!(integrity_message(restored.raw).unwrap(), "ok");
  }
}
