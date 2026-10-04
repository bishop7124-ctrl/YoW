# What to do when changes are not saving

YOW shows whether manuscript changes are saving, saved or waiting for a retry; preserve the current text before taking recovery steps.

## The how

1. Stop editing and check the manuscript save indicator.
2. If it says **Saving…**, keep the tab open and wait for **Saved**.
3. If a save error appears, copy the full scene using the scene’s **Copy** control and paste it into a temporary local document.
4. Check **Account Settings → Storage** for a reached quota or unavailable cloud mode.
5. Check the internet connection if Cloud Sync is active.
6. Close duplicate tabs editing the same scene.
7. After preserving the text, retry or reload only if the warning remains.
8. If the error returns, contact support with the exact message and what you were editing.

📸 SCREENSHOT: In a controlled test build, show the manuscript top bar with a simulated save error and the scene-level **Copy** control. Use disposable prose, crop out account information and highlight both controls. Do not manufacture an error in a real customer project.

## The why: understanding save states

- **Saving…** means a recent change is still being written.
- **Saved** means the active storage layer accepted current changes.
- A save error means the latest change could not be written to the device; YOW keeps retrying while the tab remains open.

Cloud Mode stores account data for syncing and also uses a local browser or desktop copy. Desktop Local Mode writes to the local vault and pauses automatic cloud writes.

### Common causes

- The account storage limit has been reached.
- The network or cloud service is temporarily unavailable.
- Cloud hosting is inactive on the web.
- The desktop vault is unavailable, moved or out of disk space.
- Another tab saved an older version of the same scene, producing a conflict copy.

Do not repeatedly refresh while an unsaved warning is visible. First copy the current scene and note any other recent changes. A project export is useful only after the app can read the current saved project state; copied prose is the immediate safeguard for text still in the editor.

## Related articles

- Reviewing scene conflict copies
- Checking storage use and resolving a storage limit
- Contacting support and sending feedback
