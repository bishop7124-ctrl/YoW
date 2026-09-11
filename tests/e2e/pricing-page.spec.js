import { expect, test } from '@playwright/test'
import { dismissLaunchPrompts, seedCleanStorage } from './helpers.js'

// Covers part of the "Pricing page overhaul" row in docs/ROADMAP.md's Active
// section — structural/reachability QA of the pricing page at desktop and
// the two established responsive-smoke widths (375px/768px), plus the beta
// interest modal's client-side behavior (plan pinning, required-email
// validation, close). Deliberately does NOT submit the interest form to a
// real backend or assert on the Stripe Price object amounts — those need
// live Stripe dashboard access and a deployed environment (see the Bugs
// table's Stripe-price-mismatch note and QA_PLAN.md Priority 0), which this
// sandbox doesn't have.

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
})

async function gotoPricing(page) {
  await page.goto('/pricing')
  await dismissLaunchPrompts(page)
}

test('all four plan cards render with the current displayed prices', async ({ page }) => {
  await gotoPricing(page)
  await expect(page.getByRole('article', { name: 'Free plan — Free' })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Monthly plan — £10' })).toBeVisible()
  await expect(page.getByRole('article', { name: /Lifetime plan — £150/ })).toBeVisible()
  await expect(page.getByRole('article', { name: /Founder plan — £300/ })).toBeVisible()
})

test('comparison table lists all four plans', async ({ page }) => {
  await gotoPricing(page)
  const table = page.getByRole('table')
  await table.scrollIntoViewIfNeeded()
  await expect(table).toBeVisible()
  await expect(table.getByRole('columnheader', { name: 'Free' })).toBeVisible()
  await expect(table.getByRole('columnheader', { name: 'Monthly' })).toBeVisible()
  await expect(table.getByRole('columnheader', { name: 'Lifetime' })).toBeVisible()
  await expect(table.getByRole('columnheader', { name: 'Founder' })).toBeVisible()
})

test('Register interest pins the selected plan, requires a valid email, and closes cleanly', async ({ page }) => {
  // vite.config.mjs wires `/api/register-paid-interest` to the real handler
  // (api/register-paid-interest.js) even in this offline dev server — it
  // isn't a 404 or a no-op here. Guard against ever actually calling it: this
  // test only wants to exercise client-side required-field validation, never
  // a real (env-var-dependent, rate-limited) submission.
  let interestEndpointCalled = false
  await page.route('**/api/register-paid-interest', route => {
    interestEndpointCalled = true
    route.abort()
  })

  await gotoPricing(page)

  const monthlyCard = page.getByRole('article', { name: 'Monthly plan — £10' })
  await monthlyCard.getByRole('button', { name: 'Register interest' }).click()

  const modal = page.getByRole('dialog', { name: 'Paid plans are coming soon' })
  await expect(modal).toBeVisible()
  // A plan was pinned by the card clicked, so the generic plan picker
  // (shown only when no plan is pinned) should not appear.
  await expect(modal.getByText('Which plan are you interested in?')).toHaveCount(0)
  await expect(modal.getByText(/Monthly is ready/)).toBeVisible()

  // Email is required (native HTML5 validation via type="email" required) —
  // submitting empty should not advance past the form. The field comes
  // pre-filled with this suite's fixed offline-mode user's email
  // ('dev@localhost', itself a valid HTML5 email), so it must be cleared
  // first or this test would silently pass client validation instead of
  // exercising the "required" check it's named for.
  await modal.getByLabel('Email').fill('')
  await modal.getByRole('button', { name: 'Register interest' }).click()
  await expect(modal.getByLabel('Email')).toBeVisible()
  await expect(modal.getByText('Registering...')).toHaveCount(0)
  expect(interestEndpointCalled).toBe(false)

  await modal.getByRole('button', { name: 'Close beta access modal' }).click()
  await expect(modal).toHaveCount(0)
})

for (const viewport of [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
]) {
  test(`pricing page is reachable and usable on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await gotoPricing(page)

    for (const label of ['Free plan — Free', 'Monthly plan — £10', /Lifetime plan — £150/, /Founder plan — £300/]) {
      const card = page.getByRole('article', { name: label })
      await card.scrollIntoViewIfNeeded()
      await expect(card).toBeVisible()
    }

    const table = page.getByRole('table')
    await table.scrollIntoViewIfNeeded()
    await expect(table).toBeVisible()

    const lifetimeCard = page.getByRole('article', { name: /Lifetime plan — £150/ })
    await lifetimeCard.getByRole('button', { name: 'Register interest' }).click()
    const modal = page.getByRole('dialog', { name: 'Paid plans are coming soon' })
    await expect(modal).toBeVisible()
    await modal.getByRole('button', { name: 'Close beta access modal' }).click()
    await expect(modal).toHaveCount(0)
  })
}
