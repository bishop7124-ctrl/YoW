import { expect, test } from '@playwright/test'

test('pricing presents paid plans as interest-only launch terms', async ({ page }) => {
  await page.goto('/pricing/')

  await expect(page.getByText('Free is available now. Paid plans and the desktop workspace are coming soon')).toBeVisible()
  await expect(page.locator('.pricing-card').getByRole('button', { name: 'Register interest' })).toHaveCount(3)
  await expect(page.getByText(/slots remaining/i)).toHaveCount(0)

  const paidAvailability = await page.locator('#ld-pricing-product').evaluate(node => {
    const schema = JSON.parse(node.textContent)
    return schema.offers.filter(offer => offer.name !== 'Free').map(offer => offer.availability)
  })
  expect(paidAvailability).toEqual([
    'https://schema.org/PreOrder',
    'https://schema.org/PreOrder',
    'https://schema.org/PreOrder',
  ])
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
  await expect(page.getByText(/A consumer ChatGPT Plus or Claude Pro subscription does not automatically include API access/)).toBeVisible()

  await page.getByRole('button', { name: 'Does YOW work on mobile?' }).click()
  await expect(page.getByText(/Existing maps can be viewed on phones; map editing is supported on tablets and desktops/)).toBeVisible()

  await page.getByRole('button', { name: 'Is my data encrypted in the desktop app?' }).click()
  await expect(page.getByText(/YOW does not separately encrypt that file/)).toBeVisible()
})
