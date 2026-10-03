import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = relative => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8')

function filesUnder(relative, extensions) {
  const directory = new URL(`../../${relative}/`, import.meta.url)
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const child = `${relative}/${entry.name}`
    if (entry.isDirectory()) return filesUnder(child, extensions)
    return extensions.some(ext => entry.name.endsWith(ext)) && !/\.test\./.test(entry.name) ? [child] : []
  })
}

// Set by the hosting platform, not by the owner.
const PLATFORM_PROVIDED = new Set(['VERCEL_URL', 'NODE_ENV', 'SUPABASE_URL_INTERNAL'])

describe('.env.example', () => {
  const example = read('.env.example')

  it('documents every server-side variable the API routes and Edge Functions read', () => {
    const names = new Set()
    for (const file of [...filesUnder('api', ['.js']), ...filesUnder('supabase/functions', ['.ts'])]) {
      const source = read(file)
      for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) names.add(match[1])
      for (const match of source.matchAll(/(?:Deno\.env\.get|settingOn|env\[)\(?\s*['"]([A-Z][A-Z0-9_]+)['"]/g)) names.add(match[1])
    }
    const undocumented = [...names].filter(name => !PLATFORM_PROVIDED.has(name) && !new RegExp(`\\b${name}\\b`).test(example))
    expect(undocumented).toEqual([])
  })

  it('never exposes a provider key, secret or password to the browser bundle', () => {
    const viteNames = [...example.matchAll(/^[# ]*(VITE_[A-Z0-9_]+)=/gm)].map(match => match[1])
    const risky = viteNames.filter(name => /(KEY|SECRET|TOKEN|PASSWORD)/.test(name))
    expect(risky.sort()).toEqual(['VITE_DEV_PASSWORD', 'VITE_SUPABASE_ANON_KEY'])
  })

  it('is not read by the client under any provider-key name', () => {
    const offenders = []
    for (const file of filesUnder('src', ['.js', '.jsx'])) {
      const hits = read(file).match(/import\.meta\.env\.VITE_[A-Z0-9_]*(OPENROUTER|OPENAI|ANTHROPIC|GOOGLE_AI|GROQ|MISTRAL|TOGETHER)[A-Z0-9_]*/g)
      if (hits) offenders.push(`${file}: ${hits.join(', ')}`)
    }
    expect(offenders).toEqual([])
  })
})
