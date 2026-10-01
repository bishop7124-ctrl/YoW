import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const projectDir = "/Users/bishop/Desktop/Claude/yow";
const outputDir = `${projectDir}/output/launch-plan-2026-09-27`;
const font = "Arial";

// Keep the workbook and calendar in lockstep with the single canonical schedule.
const roadmap = await fs.readFile(`${projectDir}/docs/ROADMAP.md`, "utf8");
const sprintText = roadmap.split("### Condensed paid-launch sprint")[1].split("### Superseded paid-launch calendar")[0];
const taskLines = sprintText.split("\n").filter(line => /^\| (Mon|Tue|Wed|Thu|Fri|Sat|Sun) /.test(line));
const phaseFor = (date) => {
  if (date <= "2026-10-04") return "Release & data safety";
  if (date <= "2026-10-11") return "Cloud & security";
  if (date <= "2026-10-18") return "Desktop";
  if (date <= "2026-10-25") return "Product acceptance";
  if (date <= "2026-10-31") return "Payments & release";
  return date === "2026-11-01" ? "Quiet release" : "Public launch";
};
const monthNumber = { Sep: "09", Oct: "10", Nov: "11" };
const tasks = taskLines.map((line, index) => {
  const cells = line.split("|").slice(1, -1).map(value => value.trim());
  const match = cells[0].match(/^(\w{3}) (\d{1,2}) (\w{3})$/);
  const date = `2026-${monthNumber[match[3]]}-${String(match[2]).padStart(2, "0")}`;
  return { date, week: `Week ${Math.floor(index / 7) + 1}`, phase: phaseFor(date), aiTask: cells[1], ownerTask: cells[2], timeCap: cells[3], hardGate: "Yes" };
});
if (tasks.length !== 36) throw new Error(`Expected 36 sprint tasks, found ${tasks.length}`);

const phaseColors = {
  "Release & data safety": "#DCEAF7",
  "Cloud & security": "#FCE8E6",
  "Desktop": "#E9E1F5",
  "Product acceptance": "#DFF1E8",
  "Payments & release": "#FDF1D5",
  "Quiet release": "#D4E8E6",
  "Public launch": "#B9DED7",
};
const phaseMeaning = {
  "Release & data safety": "Stabilise YOW and prove accounts, saves, destructive actions, and backups cannot silently lose or mix customer work.",
  "Cloud & security": "Prove production services, storage, expiry rules, exports, and security controls behave safely.",
  "Desktop": "Prove the downloadable Mac and Windows apps are complete, durable, export correctly, and update safely.",
  "Product acceptance": "Use every advertised project type and major workspace like a customer, including real devices and realistic data.",
  "Payments & release": "Freeze truthful copy, prove Stripe and entitlements, prepare Beta closure, and rehearse the exact release.",
  "Quiet release": "Make the paid product real without advertising, complete one genuine purchase, and watch closely.",
  "Public launch": "After a healthy overnight period, publish the announcement and begin marketing to new customers.",
};
const doneMeaning = {
  "Release & data safety": "The named test passes with saved evidence and no unresolved auth, data-loss, isolation, save, restore, or export blocker.",
  "Cloud & security": "The named production or export check passes with saved evidence and no unresolved security, ownership, storage, or lifecycle blocker.",
  "Desktop": "The named packaged-app journey passes on the required real machine, and the evidence is saved.",
  "Product acceptance": "The named customer journey works as advertised, and any reproducible launch-blocking failure is fixed and retested.",
  "Payments & release": "The named legal, payment, Beta, or release check passes, evidence is saved, and no promise conflicts with behaviour.",
  "Quiet release": "One real purchase grants the correct access; save and export work; Beta is no longer public; existing testers stay safe; rollback is ready.",
  "Public launch": "Overnight health is clean, approved marketing is live, and payment, entitlement, analytics, and support monitoring are active.",
};
const isWeekend = date => [0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay());
const safetyRule = phase => {
  if (phase === "Release & data safety") return "Use designated test accounts and disposable projects. Never test deletion or permissions on the owner/admin account.";
  if (phase === "Cloud & security") return "Back up first. Never paste credentials, API keys, recovery codes, or secret values into chat.";
  if (phase === "Desktop") return "Use a test build and isolated test vault, never the only copy of real writing.";
  if (phase === "Payments & release") return "Stay in Stripe test mode; publish, email, or enable nothing before its dated instruction.";
  if (phase === "Quiet release") return "Back up first. Stop and roll back if auth, payment, entitlement, save, or export differs from rehearsal. No ads today.";
  if (phase === "Public launch") return "Do not publish until overnight evidence is healthy. Keep rollback and checkout-disable instructions open.";
  return "Use disposable data and stop instead of guessing if the screen differs from the instructions.";
};
const makePrompt = task => `Today is ${task.date}. Work on YOW in ${projectDir}. Read AGENTS.md and docs/ROADMAP.md first. I am a complete beginner, so own all code changes, terminal work, automated tests, documentation, evidence collection, and safe troubleshooting yourself.

MORNING TECHNICAL ASSIGNMENT
${task.aiTask}

EVENING OWNER ACTION TO PREPARE
${task.ownerTask}

TIME LIMIT
${task.timeCap}. Do not create extra owner work beyond this cap.

HOW TO WORK
Work autonomously as far as safely possible. Preserve unrelated user changes. Update docs/ROADMAP.md and docs/QA_PLAN.md when evidence or behaviour changes. Then give me one beginner-friendly step at a time for the owner action. Before each owner step, say which app or website to open, exactly what to click or type, what I should expect to see, and what I must not touch. Do not ask me to edit code or run terminal commands. Never request passwords, API keys, recovery codes, or secret values. Stop before destructive production, live billing, email, or public actions unless this dated task explicitly authorises that exact action.

DONE MEANS
${doneMeaning[task.phase]}
At the end, state Done, In progress, or Blocked; list the evidence; and name the single next action if unfinished.`;
const ownerSteps = task => [
  `1. Morning (${isWeekend(task.date) ? "15" : "10"} minutes): open Codex and paste the entire AI prompt from the previous column. Then leave the technical work with AI.`,
  isWeekend(task.date) ? "2. Block 1: do the first half of the guided test, then take a real break. Block 2: continue from the last safe step and review the evidence." : "2. Evening: open Codex's result and follow its owner instructions one step at a time.",
  `3. Your action: ${task.ownerTask}`,
  `4. Safety: ${safetyRule(task.phase)}`,
  `5. Stop when ${task.timeCap} is used. Mark In progress or Blocked with the last successful step; never borrow time from tomorrow.`,
  "6. Mark Done only when the expected result and evidence are both present.",
].join("\n");

const workbook = Workbook.create();
const start = workbook.worksheets.add("Start Here");
const plan = workbook.worksheets.add("Daily Guide");
const calendar = workbook.worksheets.add("Calendar");
const glossary = workbook.worksheets.add("Glossary");

start.showGridLines = false;
start.tabColor = "#17324D";
start.getRange("A2:H2").merge();
start.getRange("A2").values = [["YOW November launch sprint — start here"]];
start.getRange("A2").format.font = { name: font, size: 16, bold: true, color: "#17324D" };
start.getRange("A3:H3").merge();
start.getRange("A3").values = [["Quiet release Sunday 1 November · public launch and marketing Monday 2 November"]];
start.getRange("A3").format.font = { name: font, size: 10, italic: true, color: "#566573" };
const sections = [
  [5, "The basic routine", "Every morning: spend 10 minutes (15 on weekends) copying today's prompt into Codex. AI handles code, terminal work, automated tests, documents, and evidence while you are at work or with your family.\n\nEvery evening: open the result and do only the guided owner task: clicks, decisions, real-device checks, or account-dashboard work."],
  [12, "Your non-negotiable time limits", "Weekday: 10 minutes in the morning plus no more than 110 minutes in the evening. Most days are shorter.\nWeekend: 15 minutes in the morning plus two blocks totalling no more than 3 hours 45 minutes. Absolute total: four hours.\n\nWhen time is up, stop and mark In progress. Do not double tomorrow's work."],
  [19, "How to use the Daily Guide", "1. Find today's row.\n2. Copy its entire morning prompt into Codex before work.\n3. In the evening, read Codex's result and your Owner instructions.\n4. Follow one step at a time and report exactly what appears.\n5. Set Status to Done, In progress, or Blocked and add a note.\n6. Work in order. Never skip a failed hard gate."],
  [26, "Safety rules", "Never paste passwords, API keys, recovery codes, or secrets into chat or this workbook. Use disposable data and designated test accounts. Stop when a screen differs from the instructions. Never test deletion or permissions with the owner/admin account. Real checkout stays off until the rehearsal passes."],
  [33, "Beta closure and launch", "31 October: rehearse; checkout stays off.\n1 November: if every gate is green, deploy quietly, remove Beta as a public tier, stop new Beta grants, preserve existing testers' access and exports, enable checkout, and complete one real purchase. No ads.\n2 November: verify overnight health, then announce and market."],
  [40, "If something fails", "A failed auth, data-loss, save, export, desktop, legal, payment, or release-candidate gate moves launch. That is a safety decision, not a personal failure. Record the evidence, stop safely, and let AI prepare the repair. Cosmetic polish and new ideas wait until after launch."],
  [47, "Import the calendar", "Apple Calendar: File → Import → choose YOW-November-Launch-Calendar.ics.\nGoogle Calendar: Settings → Import & export → Import → choose the .ics file.\nOutlook: Add calendar → Upload from file.\n\nWeekdays: 7:30 AM handoff and 8:30 PM owner block. Weekends: 8:30 AM handoff plus two blocks. Times use Europe/London and can be dragged to fit your routine."],
];
for (const [row, title, body] of sections) {
  start.getRange(`A${row}:H${row}`).merge();
  start.getRange(`A${row}`).values = [[title]];
  start.getRange(`A${row}:H${row}`).format = { fill: "#17324D", font: { name: font, size: 11, bold: true, color: "#FFFFFF" }, verticalAlignment: "center" };
  start.getRange(`A${row + 1}:H${row + 5}`).merge();
  start.getRange(`A${row + 1}`).values = [[body]];
  start.getRange(`A${row + 1}:H${row + 5}`).format = { fill: "#F7F9FA", font: { name: font, size: 10, color: "#243442" }, wrapText: true, verticalAlignment: "top", borders: { preset: "outside", style: "thin", color: "#C9D3DC" } };
}
for (const col of "ABCDEFGH") start.getRange(`${col}:${col}`).format.columnWidth = 18;
start.getRange("5:52").format.rowHeight = 22;

plan.showGridLines = false;
plan.tabColor = "#2B7A78";
plan.getRange("A2:J2").merge();
plan.getRange("A2").values = [["YOW daily guide — 28 September to 2 November 2026"]];
plan.getRange("A2").format.font = { name: font, size: 16, bold: true, color: "#17324D" };
plan.getRange("A3:J3").merge();
plan.getRange("A3").values = [["Morning: paste one prompt. Evening/weekend: do only your guided action. Never exceed the time cap."]];
plan.getRange("A3").format.font = { name: font, size: 10, italic: true, color: "#566573" };
const lastRow = 10 + tasks.length;
plan.getRange("A5:B9").values = [["Tasks", null], ["Done", null], ["Remaining", null], ["Blocked", null], ["Progress", null]];
plan.getRange("B5").formulas = [[`=COUNTA(A11:A${lastRow})`]];
plan.getRange("B6").formulas = [[`=COUNTIF(I11:I${lastRow},"Done")`]];
plan.getRange("B7").formulas = [["=B5-B6"]];
plan.getRange("B8").formulas = [[`=COUNTIF(I11:I${lastRow},"Blocked")`]];
plan.getRange("B9").formulas = [["=IFERROR(B6/B5,0)"]];
plan.getRange("B9").format.numberFormat = "0%";
plan.getRange("A5:A9").format.font = { name: font, size: 10, bold: true, color: "#17324D" };
plan.getRange("B5:B9").format.font = { name: font, size: 11, bold: true, color: "#17324D" };
plan.getRange("A5:B9").format.fill = "#F3F6F8";
plan.getRange("A5:B9").format.borders = { preset: "outside", style: "thin", color: "#C9D3DC" };
plan.getRange("D5:J5").merge();
plan.getRange("D5").values = [["The only rule that matters"]];
plan.getRange("D5").format.font = { name: font, size: 11, bold: true, color: "#17324D" };
plan.getRange("D6:J9").merge();
plan.getRange("D6").values = [["AI owns the technical work. You own guided verification and decisions. Stop at the time cap. A task may remain In progress; a hard gate may not be waved through."]];
plan.getRange("D6:J9").format = { fill: "#FFF7E6", font: { name: font, size: 10, color: "#5A4625" }, wrapText: true, verticalAlignment: "center", borders: { preset: "outside", style: "thin", color: "#E8C980" } };
plan.getRange("A10:J10").values = [["Date", "Day", "Phase", "Morning: copy this entire prompt into Codex", "Evening / weekend: exactly what you do", "Time cap", "Done means", "Hard gate?", "Status", "Notes / evidence"]];
const rows = tasks.map(task => [new Date(`${task.date}T12:00:00Z`), isWeekend(task.date) ? "Weekend" : "Weekday", task.phase, makePrompt(task), ownerSteps(task), task.timeCap, doneMeaning[task.phase], task.hardGate, "Not started", ""]);
plan.getRange(`A11:J${lastRow}`).values = rows;
plan.getRange(`A11:A${lastRow}`).format.numberFormat = "ddd d mmm";
plan.getRange(`A10:J${lastRow}`).format.font = { name: font, size: 10, color: "#243442" };
plan.getRange("A10:J10").format = { fill: "#17324D", font: { name: font, size: 10, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true };
plan.getRange(`A11:J${lastRow}`).format.verticalAlignment = "top";
plan.getRange(`D11:G${lastRow}`).format.wrapText = true;
plan.getRange(`J11:J${lastRow}`).format.wrapText = true;
plan.getRange(`H11:I${lastRow}`).format.horizontalAlignment = "center";
plan.getRange(`I11:I${lastRow}`).dataValidation = { rule: { type: "list", values: ["Not started", "In progress", "Blocked", "Done"] } };
for (const [text, fill, color] of [["Done", "#DDF2E3", "#216E39"], ["In progress", "#FFF1C7", "#805B00"], ["Blocked", "#FADBD8", "#A61B1B"], ["Not started", "#EEF2F5", "#566573"]]) plan.getRange(`I11:I${lastRow}`).conditionalFormats.add("containsText", { text, format: { fill, font: { color, bold: text !== "Not started" } } });
tasks.forEach((task, i) => { plan.getRange(`C${11 + i}`).format.fill = phaseColors[task.phase]; if (isWeekend(task.date)) plan.getRange(`B${11 + i}`).format.fill = "#E9E1F5"; });
plan.getRange(`A10:J${lastRow}`).format.borders = { insideHorizontal: { style: "thin", color: "#DDE3E8" }, bottom: { style: "thin", color: "#AAB7C2" } };
const table = plan.tables.add(`A10:J${lastRow}`, true, "LaunchTasksTable");
table.style = "TableStyleMedium2";
table.showFilterButton = true;
plan.freezePanes.freezeRows(10);
plan.freezePanes.freezeColumns(3);
for (const [col, width] of Object.entries({ A: 14, B: 12, C: 22, D: 82, E: 72, F: 21, G: 44, H: 12, I: 15, J: 34 })) plan.getRange(`${col}:${col}`).format.columnWidth = width;
plan.getRange(`11:${lastRow}`).format.rowHeight = 168;
plan.getRange("10:10").format.rowHeight = 36;

calendar.showGridLines = false;
calendar.tabColor = "#2B7A78";
calendar.getRange("A2:N2").merge();
calendar.getRange("A2").values = [["YOW launch calendar — at a glance"]];
calendar.getRange("A2").format.font = { name: font, size: 16, bold: true, color: "#17324D" };
calendar.getRange("A3:N3").merge();
calendar.getRange("A3").values = [["Weekdays ≤2 hours · weekends ≤4 hours · use Daily Guide for the full prompt and exact instructions"]];
calendar.getRange("A3").format.font = { name: font, size: 10, italic: true, color: "#566573" };
const dayStarts = ["A", "C", "E", "G", "I", "K", "M"];
let calendarRow = 5;
for (let week = 0; week < 6; week++) {
  const weekTasks = tasks.slice(week * 7, week * 7 + 7);
  calendar.getRange(`A${calendarRow}:N${calendarRow}`).merge();
  calendar.getRange(`A${calendarRow}`).values = [[`Week ${week + 1} · ${weekTasks[0].date} to ${weekTasks.at(-1).date}`]];
  calendar.getRange(`A${calendarRow}:N${calendarRow}`).format = { fill: phaseColors[weekTasks[0].phase], font: { name: font, size: 11, bold: true, color: "#17324D" }, verticalAlignment: "center", borders: { preset: "outside", style: "thin", color: "#AAB7C2" } };
  for (let day = 0; day < 7; day++) {
    const task = weekTasks[day];
    const col1 = dayStarts[day];
    const col2 = String.fromCharCode(col1.charCodeAt(0) + 1);
    calendar.getRange(`${col1}${calendarRow + 1}:${col2}${calendarRow + 1}`).merge();
    calendar.getRange(`${col1}${calendarRow + 2}:${col2}${calendarRow + 6}`).merge();
    if (task) {
      const label = new Date(`${task.date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
      calendar.getRange(`${col1}${calendarRow + 1}`).values = [[label]];
      calendar.getRange(`${col1}${calendarRow + 2}`).values = [[`AM — AI\n${task.aiTask}\n\nPM / BLOCKS — YOU\n${task.ownerTask}\n\nCAP: ${task.timeCap}`]];
    }
    calendar.getRange(`${col1}${calendarRow + 1}:${col2}${calendarRow + 1}`).format = { fill: "#17324D", font: { name: font, size: 10, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center", borders: { preset: "outside", style: "thin", color: "#AAB7C2" } };
    calendar.getRange(`${col1}${calendarRow + 2}:${col2}${calendarRow + 6}`).format = { fill: task && isWeekend(task.date) ? "#F3EEF9" : task ? "#FFFFFF" : "#F3F6F8", font: { name: font, size: 9, color: "#243442" }, wrapText: true, verticalAlignment: "top", borders: { preset: "outside", style: "thin", color: "#C9D3DC" } };
  }
  calendar.getRange(`${calendarRow}:${calendarRow}`).format.rowHeight = 24;
  calendar.getRange(`${calendarRow + 1}:${calendarRow + 1}`).format.rowHeight = 24;
  calendar.getRange(`${calendarRow + 2}:${calendarRow + 6}`).format.rowHeight = 26;
  calendarRow += 8;
}
for (const col of "ABCDEFGHIJKLMN") calendar.getRange(`${col}:${col}`).format.columnWidth = 13;
calendar.freezePanes.freezeRows(3);

glossary.showGridLines = false;
glossary.tabColor = "#7B8794";
glossary.getRange("A2:C2").merge();
glossary.getRange("A2").values = [["Plain-English glossary"]];
glossary.getRange("A2").format.font = { name: font, size: 16, bold: true, color: "#17324D" };
glossary.getRange("A3:C3").merge();
glossary.getRange("A3").values = [["You are not expected to memorise these words. Look here whenever the plan uses one you do not know."]];
glossary.getRange("A3").format.font = { name: font, size: 10, italic: true, color: "#566573" };
const glossaryRows = [
  ["Term", "What it means", "Why you care"],
  ["AI handoff", "The morning prompt pasted into Codex so it can do technical work while you are unavailable.", "It turns a few morning minutes into a prepared evening test."],
  ["Scope freeze", "No new launch features; only work needed to make the agreed product safe and honest.", "It protects the target from nonessential ideas."],
  ["QA", "Deliberately testing the product and recording what passed or failed.", "It prevents customers discovering serious problems after paying."],
  ["Smoke test", "A short critical-path test: sign in, open, write, save, and export.", "If it fails, deeper work pauses until basics are repaired."],
  ["Production", "The live YOW service and real customer data.", "Actions here can affect real people."],
  ["Database migration", "A versioned instruction changing database structure, functions, or security rules.", "It must be verified and reversible."],
  ["RLS", "Database rules deciding which user may read or change each row.", "It prevents customers seeing each other's data."],
  ["Stripe test mode", "A safe Stripe environment using pretend cards and no real money.", "Payment behaviour must pass here before checkout is live."],
  ["Webhook", "A signed message Stripe sends YOW after a payment event.", "It changes paid access."],
  ["Entitlement", "The server-controlled record of features a plan allows.", "Customers receive exactly what they paid for."],
  ["Release candidate", "The exact build proposed for launch after feature work stops.", "Only blockers should alter it."],
  ["Hard gate", "A safety or business check that must pass before launch proceeds.", "Failure moves the date; it is never skipped."],
  ["Rollback", "Return production to its previous known-good version.", "It is the safe exit when launch differs from rehearsal."],
  ["Quiet release", "Checkout is live but ads are not; one real purchase proves the full path.", "It catches production-only problems before traffic arrives."],
  ["Public launch", "The healthy product is announced and marketing begins.", "People seeing an ad can buy immediately."],
  ["Beta closure", "Stop offering Beta to new people while preserving existing testers' agreed access and exports.", "It changes the offer without abruptly locking people out."],
  ["Evidence", "A result, screenshot, log, file, or observation showing what happened.", "Done means proven, not attempted."],
];
glossary.getRange(`A5:C${4 + glossaryRows.length}`).values = glossaryRows;
glossary.getRange("A5:C5").format = { fill: "#17324D", font: { name: font, size: 10, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center" };
glossary.getRange(`A6:C${4 + glossaryRows.length}`).format = { font: { name: font, size: 10, color: "#243442" }, wrapText: true, verticalAlignment: "top", borders: { insideHorizontal: { style: "thin", color: "#DDE3E8" } } };
glossary.getRange("A:A").format.columnWidth = 25;
glossary.getRange("B:B").format.columnWidth = 65;
glossary.getRange("C:C").format.columnWidth = 65;
glossary.getRange(`6:${4 + glossaryRows.length}`).format.rowHeight = 48;
glossary.freezePanes.freezeRows(5);

workbook.recalculate();
console.log((await workbook.inspect({ kind: "table", range: "Daily Guide!A2:J13", include: "values,formulas", tableMaxRows: 13, tableMaxCols: 10 })).ndjson);
console.log((await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!", options: { useRegex: true, maxResults: 100 }, summary: "formula error scan" })).ndjson);
await fs.mkdir(outputDir, { recursive: true });
for (const [sheetName, fileName, range] of [["Start Here", "start-here-sprint-preview.png", "A1:H52"], ["Daily Guide", "daily-guide-sprint-preview.png", "A1:J13"], ["Calendar", "calendar-sprint-preview.png", null], ["Glossary", "glossary-sprint-preview.png", null]]) {
  const preview = await workbook.render({ sheetName, ...(range ? { range } : { autoCrop: "all" }), scale: 1, format: "png" });
  await fs.writeFile(`${outputDir}/${fileName}`, new Uint8Array(await preview.arrayBuffer()));
}
await (await SpreadsheetFile.exportXlsx(workbook)).save(`${outputDir}/YOW-November-Launch-Sprint.xlsx`);

const escapeIcs = value => String(value).replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
const compactDate = date => date.replaceAll("-", "");
const addMinutes = (hhmm, mins) => { const [h, m] = hhmm.split(":").map(Number); const total = h * 60 + m + mins; return `${String(Math.floor(total / 60)).padStart(2, "0")}${String(total % 60).padStart(2, "0")}`; };
const short = (text, max = 72) => text.length > max ? `${text.slice(0, max - 3)}...` : text;
const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//YOW//November Launch Sprint//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:YOW November Launch Sprint", "X-WR-TIMEZONE:Europe/London"];
const addEvent = ({ task, index, suffix, start, duration, summary, description }) => ics.push("BEGIN:VEVENT", `UID:yow-${task.date}-${index + 1}-${suffix}@yourownworld.co.uk`, "DTSTAMP:20260927T120000Z", `DTSTART;TZID=Europe/London:${compactDate(task.date)}T${start.replace(":", "")}00`, `DTEND;TZID=Europe/London:${compactDate(task.date)}T${addMinutes(start, duration)}00`, `SUMMARY:${escapeIcs(summary)}`, `DESCRIPTION:${escapeIcs(description)}`, `CATEGORIES:${escapeIcs(`YOW Launch,${task.phase},${task.week}`)}`, "TRANSP:OPAQUE", "STATUS:CONFIRMED", "END:VEVENT");
tasks.forEach((task, index) => {
  const weekend = isWeekend(task.date);
  addEvent({ task, index, suffix: "ai", start: weekend ? "08:30" : "07:30", duration: weekend ? 15 : 10, summary: "YOW · send today's AI task", description: `COPY THIS WHOLE PROMPT INTO CODEX\n\n${makePrompt(task)}` });
  if (weekend) {
    addEvent({ task, index, suffix: "owner1", start: "09:00", duration: 120, summary: `YOW · owner block 1 · ${short(task.ownerTask)}`, description: `FIRST OWNER BLOCK\n${task.ownerTask}\n\nStop after two hours and take a real break.` });
    addEvent({ task, index, suffix: "owner2", start: "14:00", duration: 105, summary: "YOW · owner block 2 · finish and record evidence", description: `Continue from the last safe step. Review evidence and set Done, In progress, or Blocked.\n\nTOTAL CAP\n${task.timeCap}\n\nSAFETY\n${safetyRule(task.phase)}` });
  } else {
    const duration = Number(task.timeCap.match(/\+ (\d+) min/)?.[1] || 100);
    addEvent({ task, index, suffix: "owner", start: "20:30", duration, summary: `YOW · your task · ${short(task.ownerTask)}`, description: `OWNER ACTION\n${task.ownerTask}\n\nDONE MEANS\n${doneMeaning[task.phase]}\n\nTIME CAP\n${task.timeCap}\n\nSAFETY\n${safetyRule(task.phase)}` });
  }
});
ics.push("END:VCALENDAR", "");
await fs.writeFile(`${outputDir}/YOW-November-Launch-Calendar.ics`, ics.join("\r\n"), "utf8");
