export function extractYear(value) {
  if (value === null || value === undefined) return null
  const match = String(value).match(/-?\d+/)
  return match ? Number(match[0]) : null
}

export function getCharacterAge(character, currentYear) {
  const birthYear = extractYear(character?.birthDate)
  if (birthYear === null) return null
  const endYear = extractYear(character?.deathDate) ?? extractYear(currentYear)
  if (endYear === null) return null
  if (birthYear > endYear) return `Born ${birthYear}`
  return `${endYear - birthYear}${character?.deathDate ? ' at death' : ''}`
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
  if (!Number.isFinite(parsedAge) || parsedAge < 0 || endYear === null) return ''
  return `Year ${endYear - Math.floor(parsedAge)}`
}
