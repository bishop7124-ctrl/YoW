# YOW interest emails → Google Sheet

Reads the "[YOW Interest] ..." emails that [`api/register-paid-interest.js`](../../api/register-paid-interest.js)
sends to `yourownworld.admin@gmail.com` whenever someone registers interest in a paid
plan, and appends one row per email to a Google Sheet:

https://docs.google.com/spreadsheets/d/1k6WLfiRHc2tF3VB8IhX-th6RBdUSR0ukrECVlpZL3wQ/edit

The script is [`scripts/sync-interest-emails.mjs`](../sync-interest-emails.mjs). It's
idempotent — every email it processes gets a Gmail label (`YOW-Interest-Synced`) so
re-running never double-writes a row.

## One-time setup (~10 min)

### 1. Google Cloud project + APIs

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and create a new
   project (or reuse an existing one) — sign in with `yourownworld.admin@gmail.com`.
2. **APIs & Services → Library**: enable **Gmail API** and **Google Sheets API**.

### 2. OAuth consent screen (now called "Google Auth Platform")

Google reorganized this page — it's now split into tabs (left nav: **Google Auth
Platform**) instead of one linear "OAuth consent screen" wizard. On a personal Gmail
account (not Google Workspace) you won't be asked to pick User type at all — External
is the only option and it's set for you.

1. **Branding** tab: fill in an app name (e.g. "YOW Interest Sync") and your email as
   support/contact. Save.
2. **Audience** tab: confirm it shows **External**. Under **Test users**, add
   `yourownworld.admin@gmail.com`. While publishing status is "Testing", only accounts
   listed here can authorize the app — that's fine for a personal script and avoids
   Google's app-verification review.
3. Scopes: skip — the script requests the scopes it needs (Gmail, Sheets) directly at
   sign-in time.

### 3. OAuth client credentials

1. **Google Auth Platform → Clients** tab → **Create client** (or **APIs & Services →
   Credentials → Create Credentials → OAuth client ID** on older projects).
2. Application type: **Desktop app**. Name it anything.
3. Download the JSON and save it as:
   ```
   scripts/interest-sync/credentials.json
   ```
   (gitignored — never commit this file).

### 4. Share the Sheet

The script authenticates as `yourownworld.admin@gmail.com`, so that account needs
Editor access to the target sheet — it usually isn't the account that owns the sheet.
Open the [sheet](https://docs.google.com/spreadsheets/d/1k6WLfiRHc2tF3VB8IhX-th6RBdUSR0ukrECVlpZL3wQ/edit),
click **Share**, and add `yourownworld.admin@gmail.com` with **Editor** access.

### 5. First run — install deps and authorize

```bash
npm install
npm run sync:interest-emails
```

The first run prints a Google sign-in URL. Open it, sign in as
`yourownworld.admin@gmail.com`, and approve the Gmail (read + label) and Sheets
permissions. You'll land on a "you can close this tab" page — that's expected. The
script saves a refresh token to `scripts/interest-sync/token.json` so future runs
(including scheduled ones) don't need a browser at all.

It then scans the inbox for interest emails, writes a header row if the sheet is
empty, appends one row per email, and labels the source emails as synced.

## Running it again later

```bash
npm run sync:interest-emails
```

Only new (unlabeled) interest emails are appended each time.

## Scheduling (runs automatically, hourly)

A macOS `launchd` job is included so this runs on your Mac in the background —
no terminal or Claude session needs to stay open.

```bash
mkdir -p scripts/interest-sync/logs
cp scripts/interest-sync/co.uk.yourownworld.interest-sync.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/co.uk.yourownworld.interest-sync.plist
```

This runs the sync once immediately, then every hour. Logs go to
`scripts/interest-sync/logs/sync.log` and `sync.error.log`.

To change the frequency, edit `StartInterval` (seconds) in the plist before loading it
(e.g. `86400` for once a day).

To stop it:

```bash
launchctl unload ~/Library/LaunchAgents/co.uk.yourownworld.interest-sync.plist
rm ~/Library/LaunchAgents/co.uk.yourownworld.interest-sync.plist
```

**Note:** `launchd` only runs while your Mac is powered on (sleep is fine — it fires on
wake if a run was missed). It won't run if the machine is off.

## Sheet columns

| Date | Plan | Plan Key | Name | Email | User ID | Project | Page | Message | Gmail Message ID | Gmail Link |
|---|---|---|---|---|---|---|---|---|---|---|

`Gmail Link` opens the original email directly.

## Troubleshooting

- **"Missing .../credentials.json"** — you skipped step 3 above.
- **Token expired / auth errors after months of disuse** — delete
  `scripts/interest-sync/token.json` and run `npm run sync:interest-emails` again to
  re-authorize.
- **Wrong sheet** — pass `--sheet-id=<id>` or set `YOW_INTEREST_SHEET_ID` to override the
  default sheet ID baked into the script.
