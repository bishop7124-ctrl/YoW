# Troubleshooting imports and unexpected manuscript structure

Most import problems come from the file type, damaged archives or heading styles that do not describe the document’s visible layout.

## The how

1. Confirm you chose the right import route and supported format.
2. Open the preview and check detected structure before confirming.
3. For DOCX, apply real Word heading styles to act and chapter headings, save a new copy and retry.
4. For a native YOW ZIP, do not unpack or edit its internal JSON files before import.
5. If an archive fails validation, return to the original YOW export and download it again.
6. If a partial operation is reported, keep the destination project open, export it and contact support before retrying.

📸 SCREENSHOT: Show a disposable DOCX import preview where one visually styled heading was not detected, beside the corrected preview after applying a Word heading style. Highlight the changed structure only.

## The why: appearance and document structure differ

A heading can look large and bold while still being stored as an ordinary paragraph. YOW uses stored styles and document structure, not visual guesswork alone. Blank or repeated headings can also produce unexpected items.

Native project archives are validated for required structure, safe paths, file sizes and compatible data. Validation failure is intended to stop unsafe or incomplete records from being added.

Importing the same source again usually appends or creates another copy rather than updating the first. Back up and review duplicates before retrying.

## Related articles

- Choosing the right way to import existing work
- Importing a DOCX into an existing manuscript
- Restoring or combining a YOW project ZIP
