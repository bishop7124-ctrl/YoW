# Using Cloud Sync and Local-first storage on desktop

The desktop app keeps a local vault and can either sync automatically with cloud data or treat the device copy as the source of truth.

## The how

1. In the desktop app, open **Account Settings → Storage**.
2. Review the current **Storage & sync** mode.
3. Choose **Local-first** to pause automatic cloud syncing after reviewing the change.
4. While Local-first is active, use **Upload this device copy** or **Download cloud copy** for a manual transfer.
5. Read the difference preview carefully before confirming either replacement.
6. Select **Resume Cloud Sync** when you want automatic syncing again.
7. Resolve each record that changed both locally and in cloud, then select **Keep device choices and resume** or **Merge and resume Cloud Sync**.

📸 SCREENSHOT: In a desktop release-candidate account with disposable data, show **Local-first writing**, both manual-sync buttons and a difference preview. Do not confirm a replacement while capturing.

## The why: direction matters

Cloud Sync is active by default when hosting is eligible, while the desktop vault still keeps a local copy for offline use. Local-first pauses automatic cloud writes.

**Upload this device copy** replaces cloud project data with the device copy. **Download cloud copy** replaces the local vault’s project data. Profile, billing and membership are not part of that project-data replacement. Create a vault snapshot and project ZIP before either action.

When resuming, non-conflicting records are kept automatically. YOW asks only about records changed on both sides.

## Related articles

- Managing the desktop vault and snapshots
- Using Local Mode when cloud hosting is inactive
- Recovering work after a conflicting edit
