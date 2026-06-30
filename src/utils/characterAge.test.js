import { describe, expect, it } from 'vitest'
import { getAgeInputValue, getBirthDateFromAge, getCharacterAge } from './characterAge'

describe('character age helpers', () => {
  it('calculates living age from the project current year', () => {
    const character = { birthDate: 'Year 968' }

    expect(getAgeInputValue(character, 1000)).toBe('32')
    expect(getCharacterAge(character, 1000)).toBe('32')
    expect(getBirthDateFromAge('32', 1000)).toBe('Year 968')
  })

  it('calculates deceased age from death year instead of current year', () => {
    const deathDate = 'Year 812'
    const birthDate = getBirthDateFromAge('1062', 0, deathDate)

    expect(birthDate).toBe('Year -250')
    expect(getAgeInputValue({ birthDate, deathDate }, 0)).toBe('1062')
    expect(getCharacterAge({ birthDate, deathDate }, 0)).toBe('1062 at death')
  })

  it('does not show an age when the character is born after the relevant year', () => {
    expect(getAgeInputValue({ birthDate: 'Year 1200' }, 1000)).toBe('')
    expect(getCharacterAge({ birthDate: 'Year 1200' }, 1000)).toBe('Born 1200')
  })
})
