const PASSWORD_REQUIREMENTS = [
  { test: value => /[A-Z]/.test(value), label: 'uppercase letter' },
  { test: value => /[a-z]/.test(value), label: 'lowercase letter' },
  { test: value => /\d/.test(value), label: 'number' },
  { test: value => /[^A-Za-z0-9]/.test(value), label: 'symbol' },
  { test: value => value.length >= 8, label: 'minimum length 8 characters' },
]

export const PASSWORD_REQUIREMENTS_TEXT = 'Password requires uppercase letter, lowercase letter, number, symbol, minimum length 8 characters.'
export const PASSWORD_REQUIREMENTS_LIST = [
  'Uppercase letter',
  'Lowercase letter',
  'Number',
  'Symbol',
  'Minimum length 8 characters',
]

export function validatePassword(password = '') {
  const missing = PASSWORD_REQUIREMENTS
    .filter(rule => !rule.test(password))
    .map(rule => rule.label)

  return {
    valid: missing.length === 0,
    missing,
    message: missing.length
      ? PASSWORD_REQUIREMENTS_TEXT
      : '',
  }
}
