// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    recoveryVerifying: false,
    recoveryError: '',
  }),
}))

vi.mock('../../utils/analytics', () => ({ trackEvent: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('LoginPage password recovery', () => {
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

  it('can show and hide each new-password field independently', () => {
    render(<LoginPage recoveryMode initialScreen="auth" />)

    const newPassword = screen.getByPlaceholderText('New password')
    const confirmation = screen.getByPlaceholderText('Confirm new password')
    fireEvent.change(newPassword, { target: { value: 'Secure1!' } })

    expect(newPassword.type).toBe('password')
    expect(newPassword.getAttribute('aria-label')).toBe('New password')
    expect(confirmation.type).toBe('password')

    fireEvent.click(screen.getByRole('button', { name: 'Show new password' }))

    expect(newPassword.type).toBe('text')
    expect(newPassword.value).toBe('Secure1!')
    expect(confirmation.type).toBe('password')
    expect(screen.getByRole('button', { name: 'Hide new password' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Show confirm new password' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hide new password' }))

    expect(newPassword.type).toBe('password')
    expect(confirmation.type).toBe('text')
  })

  it('uses the compact password-flow layout for mobile recovery screens', () => {
    const { container } = render(<LoginPage recoveryMode initialScreen="auth" />)

    expect(container.querySelector('.auth-shell--password-flow')).toBeTruthy()
  })
})

describe('LoginPage password entry', () => {
  it('can show and hide the sign-in password without changing its value', () => {
    render(<LoginPage initialScreen="auth" initialMode="login" />)

    const password = screen.getByPlaceholderText('Password')
    fireEvent.change(password, { target: { value: 'WriterPass1!' } })

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password.type).toBe('text')
    expect(password.value).toBe('WriterPass1!')

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password.type).toBe('password')
    expect(password.value).toBe('WriterPass1!')
  })
})
