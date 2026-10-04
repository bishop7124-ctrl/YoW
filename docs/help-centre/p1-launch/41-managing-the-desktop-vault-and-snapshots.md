# Managing the desktop vault and snapshots

The desktop vault is the local database containing project working data on that device; snapshots provide recoverable point-in-time copies.

## The how

1. In the desktop app, open **Account Settings → Storage**.
2. Under **Local vault**, review its path, entry count and size.
3. Use **Show in Finder**, **Refresh** or **Check integrity** as needed.
4. Select **Create snapshot** to make a manual copy.
5. To relocate the vault, select **Move vault…**, read the warning and choose an empty folder or an existing YOW-vault folder.
6. To restore, select a snapshot, choose **Restore**, review the date and size, then confirm.
7. After reload, inspect the restored work before resuming Cloud Sync.

📸 SCREENSHOT: In the packaged desktop app with disposable projects, show **Local vault**, path, integrity status, **Move vault…**, automatic/manual snapshot counts and the restore selector. Mask the user folder name.

## The why: restoration replaces the active vault

Automatic snapshots keep a limited recent set; manual snapshots are kept indefinitely until removed through supported storage management. Before restore, YOW creates a **Pre-restore safety copy** of the current vault and reopens in Local-first mode.

Restoring means edits made after the selected snapshot are no longer in the active vault. Inspect first, then restore the safety copy if the chosen snapshot was wrong.

Do not place a live vault in folders synchronised by Dropbox or iCloud; two sync systems can corrupt an active database. If a chosen external folder is unavailable, YOW can temporarily use its default location and show a warning.

## Related articles

- Using Cloud Sync and Local-first storage on desktop
- Creating automatic and manual project backups
- Managing authorised desktop devices and updates
