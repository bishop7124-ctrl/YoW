import { expect, test } from '@playwright/test'

test('pricing presents paid plans as interest-only launch terms', async ({ page }) => {
  await page.goto('/pricing/')

  await expect(page.getByText('Free is available now. Beta is closing - live launch from 2 November 2026. Paid access opens then; the paid buttons stay greyed out until it does.')).toBeVisible()
  await expect(page.locator('.pricing-card').getByRole('button', { name: 'Paid access coming 2nd November' })).toHaveCount(2)
  await expect(page.getByText(/slots remaining/i)).toHaveCount(0)

  const paidAvailability = await page.locator('#ld-pricing-page').evaluate(node => {
    const schema = JSON.parse(node.textContent)
    return schema.offers.filter(offer => offer.name !== 'Free').map(offer => offer.availability)
  })
  // Every paid offer (Monthly, Lifetime) is a pre-order while checkout is closed.
  expect(paidAvailability.length).toBeGreaterThan(0)
  expect(paidAvailability.every(value => value === 'https://schema.org/PreOrder')).toBe(true)
})

test('public copy reflects AI, map, player-view, and vault decisions', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('yow_beta_acknowledged', '1')
    document.cookie = 'yow_consent=essential; path=/; SameSite=Lax'
  })
  await page.goto('/')
  await expect(page.getByText(/hidden from players|players can explore progressively|players discover progressively|Most writers use 5–8/i)).toHaveCount(0)

  await page.goto('/faq/')
  await page.getByRole('button', { name: 'What does "connect your own AI provider" mean?' }).click()
  await expect(page.getByText(/A consumer chatbot subscription \(such as ChatGPT Plus\) does not automatically include API access/)).toBeVisible()

  await page.getByRole('button', { name: 'Does YOW work on mobile?' }).click()
  await expect(page.getByText(/designed as a desktop experience.*not tested or officially supported at launch/)).toBeVisible()

  await page.getByRole('button', { name: 'Is my data encrypted in the desktop app?' }).click()
  await expect(page.getByText(/YOW does not separately encrypt that file/)).toBeVisible()
})
