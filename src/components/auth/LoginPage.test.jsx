// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LoginPage from './LoginPage'

const auth = vi.hoisted(() => ({
  updatePassword: vi.fn(),
  clearRecoveryMode: vi.fn(),
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    signIn: vi.fn(),
    signUp: vi.fn(),
    signInWithGoogle: vi.fn(),
    resendConfirmation: vi.fn(),
    resetPassword: vi.fn(),
    updatePassword: auth.updatePassword,
    clearRecoveryMode: auth.clearRecoveryMode,
  }),
}))

vi.mock('../../utils/analytics', () => ({ trackEvent: vi.fn() }))

describe('LoginPage password recovery', () => {
  afterEach(() => vi.clearAllMocks())

  it('keeps recovery mode active through the success confirmation', async () => {
    auth.updatePassword.mockResolvedValue({ error: null })
    render(<LoginPage recoveryMode initialScreen="auth" />)

    fireEvent.change(screen.getByPlaceholderText('New password'), { target: { value: 'Secure1!' } })
    fireEvent.change(screen.getByPlaceholderText('Confirm new password'), { target: { value: 'Secure1!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Password updated' })).toBeTruthy())
    expect(auth.updatePassword).toHaveBeenCalledWith('Secure1!')
    expect(auth.clearRecoveryMode).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Continue to your workspace' }))
    expect(auth.clearRecoveryMode).toHaveBeenCalledTimes(1)
  })
})
