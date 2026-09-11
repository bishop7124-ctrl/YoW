// QA sweep 2026-09-10 (product-owner autonomous session): real-browser
// verification of the remaining "needs browser QA" half of the Bugs-table
// row "2026-08-08 user report: AI chats were not saving as durable project
// entries and were not exportable to Word". The data-shape fix itself
// (aiChatSessions living on the project record, merged from legacy
// nf_chats_* keys) is already unit-tested in src/utils/aiChatHistory.test.js
// and src/utils/projectExportDocx.test.js — this drives the *actual* bottom
// AI bar UI end-to-end against a real headless browser instead: send a real
// message, confirm it survives a reload under the active project, then
// confirm the real "Word docs ZIP" export includes it.
//
// No live AI provider is configured or contacted: src/utils/aiApi.js's
// streamMessage() checks OFFLINE_MODE before it ever looks at the API key,
// so VITE_OFFLINE_MODE's mockStreamMessage() (src/utils/offlineMock.js)
// answers instead — but AIAssistant.jsx's own send() bails out with
// status 'no_key' *before* ever calling streamMessage if no API key string
// is present in nf_aiSettings, key-existence being all it checks. A fake,
// never-actually-used key is seeded via addInitScript for exactly that
// reason (never sent anywhere — OFFLINE_MODE intercepts before any network
// call would happen).
import { expect, test } from '@playwright/test'
import { unzipSync } from 'fflate'
import { createProject, dismissLaunchPrompts, OFFLINE_USER_ID, readStorage, seedCleanStorage } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.addInitScript((userId) => {
    localStorage.setItem('nf_aiSettingsOwner', userId)
    localStorage.setItem('nf_aiSettings', JSON.stringify({
      activeProvider: 'google',
      google: { apiKey: 'offline-mode-never-sent-anywhere', model: 'gemini-3.6-flash' },
    }))
  }, OFFLINE_USER_ID)
  await page.goto('/')
  await dismissLaunchPrompts(page)
})

test('a bottom AI bar exchange survives reload and is included in the Word docs ZIP export', async ({ page }) => {
  test.setTimeout(60_000)

  const projectTitle = `AI Chat Persistence ${Date.now()}`
  const userMarker = `SEEDED_USER_QUESTION_${Date.now()}`

  await createProject(page, { title: projectTitle })

  // Freshly created project lands on the overview (dashboard section) —
  // AIAssistant's SECTION_CONFIG.dashboard placeholder.
  const input = page.getByPlaceholder('Ask about your project…')
  await expect(input).toBeVisible()
  await input.fill(userMarker)
  await input.press('Enter')

  // The offline mock streams its canned response over several 30ms ticks
  // (src/utils/offlineMock.js) — wait for it to actually finish and for
  // recordAiBarExchange to persist to the project record, not just for the
  // input to clear.
  const novels = await readStorage(page, 'nf_novels')
  const projectId = novels[0].id
  await expect.poll(async () => {
    const stored = await readStorage(page, 'nf_novels')
    const project = stored.find(n => n.id === projectId)
    return (project?.aiChatSessions || []).some(s => (s.messages || []).some(m => m.content === userMarker))
  }, { timeout: 10_000 }).toBe(true)

  // Persistence check: reload (simulating "refresh/re-login") and confirm
  // the exchange is still there under the active project — the exact thing
  // this bug's original report said failed (chats living outside the
  // project data model, so they didn't travel through normal persistence).
  await page.reload()
  await dismissLaunchPrompts(page)
  const afterReload = await readStorage(page, 'nf_novels')
  const projectAfterReload = afterReload.find(n => n.id === projectId)
  expect((projectAfterReload?.aiChatSessions || []).some(
    s => (s.messages || []).some(m => m.content === userMarker),
  )).toBe(true)

  // Export check: the full project "Word docs ZIP" must include an AI Chats
  // document containing this exact exchange, not omit it as the original
  // bug did.
  await page.getByRole('button', { name: 'Project settings' }).first().click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Word docs ZIP/ }).click()
  const download = await downloadPromise
  const zipPath = await download.path()
  expect(zipPath).toBeTruthy()

  const { readFileSync } = await import('node:fs')
  const zip = unzipSync(new Uint8Array(readFileSync(zipPath)))
  const entryNames = Object.keys(zip)
  const aiChatsEntry = entryNames.find(name => /AI[- ]Chats/i.test(name))
  expect(aiChatsEntry, `expected an "AI Chats" entry among: ${entryNames.join(', ')}`).toBeTruthy()

  const { unzipSync: unzipDocx, strFromU8 } = await import('fflate')
  const docxInner = unzipDocx(zip[aiChatsEntry])
  const documentXml = strFromU8(docxInner['word/document.xml'])
  expect(documentXml).toContain(userMarker)
})
