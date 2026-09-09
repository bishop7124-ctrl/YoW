import { parseTimelineYear } from './timelineYear.js'

export const extractYear = parseTimelineYear

export function getCharacterAge(character, currentYear) {
  const birthYear = extractYear(character?.birthDate)
  if (birthYear === null) return null
  const endYear = extractYear(character?.deathDate) ?? extractYear(currentYear)
  if (endYear === null) return null
  if (birthYear > endYear) return `Born ${birthYear}`
  return `${endYear - birthYear}${extractYear(character?.deathDate) !== null ? ' at death' : ''}`
}

export function getAgeInputValue(character, currentYear) {
  const birthYear = extractYear(character?.birthDate)
  const endYear = extractYear(character?.deathDate) ?? extractYear(currentYear)
  if (birthYear === null || endYear === null || birthYear > endYear) return ''
  return String(endYear - birthYear)
}

export function getBirthDateFromAge(age, currentYear, deathDate = '') {
  const parsedAge = Number(age)
  const endYear = extractYear(deathDate) ?? extractYear(currentYear)
  if (age == null || String(age).trim() === '' || !Number.isSafeInteger(parsedAge) || parsedAge < 0 || endYear === null) return ''
  return `Year ${endYear - parsedAge}`
}
