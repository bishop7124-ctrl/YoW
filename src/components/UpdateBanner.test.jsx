// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import UpdateBanner from './UpdateBanner'

afterEach(() => { cleanup(); vi.useRealTimers() })

const tick = async ms => { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }

describe('UpdateBanner', () => {
  it('stays hidden while the site still has the same build', async () => {
    vi.useFakeTimers()
    render(<UpdateBanner currentBuild="abc1234" enabled fetchBuild={async () => 'abc1234'} />)
    await tick(11 * 60 * 1000)
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('appears when a newer build is published, and Later hides it', async () => {
    vi.useFakeTimers()
    render(<UpdateBanner currentBuild="abc1234" enabled fetchBuild={async () => 'def5678'} />)
    expect(screen.queryByRole('status')).toBeNull()
    await tick(11 * 60 * 1000)
    expect(screen.getByRole('status').textContent).toMatch(/new version of YOW/)
    fireEvent.click(screen.getByText('Later'))
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('never checks without a build id (local builds) or when disabled (desktop app)', async () => {
    vi.useFakeTimers()
    const fetchBuild = vi.fn(async () => 'def5678')
    render(<UpdateBanner currentBuild="" enabled fetchBuild={fetchBuild} />)
    render(<UpdateBanner currentBuild="abc1234" enabled={false} fetchBuild={fetchBuild} />)
    await tick(11 * 60 * 1000)
    expect(fetchBuild).not.toHaveBeenCalled()
  })
})
