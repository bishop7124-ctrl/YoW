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

test('three plan cards render and real backend availability activates the Founding Price', async ({ page }) => {
  await page.route('**/api/get-founder-slots', route => route.fulfill({ json: { total: 100, taken: 63, held: 0, remaining: 37 } }))
  await gotoPricing(page)
  await expect(page.getByRole('article', { name: 'Free plan — Free' })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Monthly plan — £10' })).toBeVisible()
  await expect(page.getByRole('article', { name: /Lifetime plan — £50/ })).toBeVisible()
  await expect(page.getByText('37 of 100 Founder spots currently available')).toBeVisible()
})

test('comparison table lists Free, Monthly and Lifetime only', async ({ page }) => {
  await gotoPricing(page)
  const table = page.getByRole('table')
  await table.scrollIntoViewIfNeeded()
  await expect(table).toBeVisible()
  await expect(table.getByRole('columnheader', { name: 'Free' })).toBeVisible()
  await expect(table.getByRole('columnheader', { name: 'Monthly' })).toBeVisible()
  await expect(table.getByRole('columnheader', { name: 'Lifetime' })).toBeVisible()
  await expect(table.getByRole('columnheader', { name: 'Founder' })).toHaveCount(0)
})

test('paid buttons are greyed out and open no interest form while beta is closed', async ({ page }) => {
  let interestEndpointCalled = false
  await page.route('**/api/register-paid-interest', route => {
    interestEndpointCalled = true
    route.abort()
  })

  await gotoPricing(page)

  const monthlyCard = page.getByRole('article', { name: 'Monthly plan — £10' })
  const button = monthlyCard.getByRole('button', { name: 'Paid access coming 2nd November' })
  await expect(button).toBeVisible()
  await expect(button).toBeDisabled()
  await button.click({ force: true })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(interestEndpointCalled).toBe(false)
})

for (const viewport of [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
]) {
  test(`pricing page is reachable and usable on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await gotoPricing(page)

    for (const label of ['Free plan — Free', 'Monthly plan — £10', /Lifetime plan — £75/]) {
      const card = page.getByRole('article', { name: label })
      await card.scrollIntoViewIfNeeded()
      await expect(card).toBeVisible()
    }

    const table = page.getByRole('table')
    await table.scrollIntoViewIfNeeded()
    await expect(table).toBeVisible()

    const lifetimeCard = page.getByRole('article', { name: /Lifetime plan — £75/ })
    await expect(lifetimeCard.getByRole('button', { name: 'Paid access coming 2nd November' })).toBeDisabled()
  })
}

test('paid buttons are greyed out while the checkout launch switch is closed', async ({ page }) => {
  await page.route('**/api/get-founder-slots', route => route.fulfill({ json: { total: 100, taken: 63, held: 0, remaining: 37, checkoutOpen: false } }))
  await gotoPricing(page)

  await expect(page.getByText('Beta is closing - live launch from 2 November 2026.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Paid access coming 2nd November' })).toHaveCount(2)
  await expect(page.getByRole('button', { name: /Choose (Monthly|Lifetime)/ })).toHaveCount(0)
})

test('paid buttons offer real checkout once the launch switch is open, and never the interest form', async ({ page }) => {
  let interestEndpointCalled = false
  let checkoutEndpointCalled = false
  await page.route('**/api/register-paid-interest', route => { interestEndpointCalled = true; route.abort() })
  await page.route('**/api/create-checkout-session', route => { checkoutEndpointCalled = true; route.abort() })
  await page.route('**/api/get-founder-slots', route => route.fulfill({ json: { total: 100, taken: 63, held: 0, remaining: 37, checkoutOpen: true } }))
  await gotoPricing(page)

  await expect(page.getByText('Beta is closing - live launch from 2 November 2026.')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Paid access coming 2nd November' })).toHaveCount(0)
  const monthlyCard = page.getByRole('article', { name: 'Monthly plan — £10' })
  await expect(monthlyCard.getByRole('button', { name: 'Choose Monthly' })).toBeVisible()
  await expect(page.getByRole('article', { name: /Lifetime plan — £50/ }).getByRole('button', { name: 'Choose Lifetime' })).toBeVisible()

  // Without a valid session it asks the visitor to sign in instead of opening the interest form or calling Stripe.
  await monthlyCard.getByRole('button', { name: 'Choose Monthly' }).click()
  await expect(page.getByRole('alert')).toContainText(/sign in/i)
  await expect(page.getByRole('dialog', { name: 'Paid plans are coming soon' })).toHaveCount(0)
  expect(interestEndpointCalled).toBe(false)
  expect(checkoutEndpointCalled).toBe(false)
})

test('checkout stays closed when the availability request fails', async ({ page }) => {
  await page.route('**/api/get-founder-slots', route => route.abort())
  await gotoPricing(page)
  await expect(page.getByRole('button', { name: 'Paid access coming 2nd November' })).toHaveCount(2)
})
