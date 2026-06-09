export const storageKeys = [
  'nf_activeNovel',
  'nf_acts',
  'nf_chapters',
  'nf_scenes',
  'nf_novels',
  'nf_characters',
  'nf_locations',
  'nf_factions',
  'nf_loreEntries',
  'nf_timeline',
  'nf_worldHistory',
  'nf_ideaEntries',
  'nf_maps',
  'nf_activeMapByNovel',
  'nf_whiteboards',
  'nf_series',
  'nf_storySchedule',
  'nf_localWriteAt',
]

export async function seedCleanStorage(page) {
  await page.addInitScript((keys) => {
    if (!sessionStorage.getItem('yow_qa_storage_seeded')) {
      for (const key of keys) localStorage.removeItem(key)
      sessionStorage.setItem('yow_qa_storage_seeded', '1')
    }
    localStorage.setItem('yow_beta_acknowledged', '1')
    document.cookie = 'yow_consent=essential; max-age=31536000; path=/; SameSite=Lax'
  }, storageKeys)
}

export async function dismissLaunchPrompts(page) {
  const betaDialog = page.getByRole('dialog', { name: 'Beta disclaimer' })
  if (await betaDialog.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Got it, let me in' }).click()
  }

  const cookieBanner = page.getByRole('region', { name: 'Cookie consent' })
  if (await cookieBanner.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Essential only' }).click()
  }
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
