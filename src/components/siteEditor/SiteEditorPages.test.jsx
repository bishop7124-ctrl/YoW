// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { it, vi } from 'vitest'
vi.mock('../../supabase', () => {
  const table = () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }), upsert: () => Promise.resolve({ error: null }) })
  return { supabase: { rpc: () => Promise.resolve({ data: true, error: null }), from: table, storage: { from: () => ({ list: () => Promise.resolve({ data: [], error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) } } }
})
import SiteEditor from './SiteEditor'
it('switches to the Features and FAQ pages without crashing', async () => {
  render(<SiteEditor user={{ id: 'o' }} authLoading={false} />)
  await screen.findByDisplayValue('Your Own World')
  fireEvent.click(screen.getByRole('button', { name: 'Features page' }))
  await screen.findByDisplayValue('Features')
  fireEvent.click(screen.getByRole('button', { name: 'FAQ page' }))
  await screen.findByDisplayValue('Frequently asked questions')
})
