# Restoring or combining a YOW project ZIP

Import ZIP restores the structured contents of a YOW backup and can create a new project or add supported content to an existing one.

## The how

### Restore as a new project

1. In the Library, select **Import ▾ → Import ZIP**.
2. Choose a YOW backup ZIP.
3. Set **Import into** to a new project.
4. Review the detected project title, type and collections.
5. Select the content to import.
6. Select **Create Project**.
7. Open the new project and inspect its manuscript and representative records.

### Add archive content to an existing project

1. Open **Import ZIP**.
2. Choose the archive.
3. Under **Import into**, select the destination project.
4. Review and select the collections.
5. Confirm the import.
6. Inspect the destination before continuing work.

📸 SCREENSHOT: Open a known-good disposable YOW ZIP in the import preview. Show **Import into**, project type, detected collections and the final create/import button. Use a backup made from test data and crop out local filenames if they contain personal information.

## The why: safe ownership and identifiers

An import creates fresh internal identifiers for the imported project and records, then remaps supported links between them. This prevents a restored copy from colliding with the source or another import of the same archive.

Importing the same ZIP twice leaves the earlier project in place and creates another independent copy. It is not an in-place update mechanism.

Native YOW archives are preferred because they carry structured data rather than only readable documents. A Word docs ZIP or PDF export is for reading and cannot replace the restore-ready archive.

If a new-project import fails, YOW attempts to remove the incomplete project. If an into-existing import fails, YOW attempts to restore the destination to its pre-import state; always inspect it and keep an external backup before a large import.

## Related articles

- Exporting a project for reading or safekeeping
- Choosing the right way to import existing work
- Recovering work after a conflicting edit
