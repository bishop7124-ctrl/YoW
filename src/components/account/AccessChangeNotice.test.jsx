// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AccessChangeNotice from './AccessChangeNotice'
import FreeProjectSelector from './FreeProjectSelector'
import { exportAllProjects } from '../../utils/projectExportAll'
vi.mock('../../utils/projectExportAll', () => ({ exportAllProjects: vi.fn() }))
afterEach(cleanup)
const store = { novels: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] }
describe('access-change backup prompt', () => {
  it('exports every project and surfaces partial failure before deletion', async () => {
    exportAllProjects.mockResolvedValue([{ ok: true }, { ok: false }])
    render(<AccessChangeNotice membership={{ usesFreeCloudLimits: true }} store={store} />)
    fireEvent.click(screen.getByText('Download all project backups'))
    await waitFor(() => expect(screen.getByText(/1 project backups failed/)).toBeTruthy())
    expect(exportAllProjects).toHaveBeenCalledWith(store, store.novels, 'zip')
  })
  it('offers backup inside the blocking project selector', () => {
    const confirm = vi.fn()
    render(<FreeProjectSelector store={store} novels={store.novels} onConfirm={confirm} />)
    expect(screen.getByText('Download all project backups')).toBeTruthy()
    expect(screen.getByText(/does not delete the others/)).toBeTruthy()
    fireEvent.click(screen.getByText('Confirm active project'))
    expect(confirm).toHaveBeenCalledWith('a')
  })
  it('shows beta notice and permits dismissing the reminder', () => {
    render(<AccessChangeNotice membership={{ isBetaNoticeActive: true, betaDaysRemaining: 12 }} store={store} />)
    expect(screen.getByText(/ends in 12 days/)).toBeTruthy()
    fireEvent.click(screen.getByText('Dismiss reminder'))
    expect(screen.queryByText(/ends in 12 days/)).toBeNull()
  })
})
