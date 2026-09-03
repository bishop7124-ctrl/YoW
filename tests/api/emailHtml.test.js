import { describe, expect, it } from 'vitest'
import { escapeHtml } from '../../supabase/functions/_shared/html.ts'

describe('escapeHtml', () => {
  it('escapes the 5 standard HTML-unsafe characters', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;')
  })

  it('leaves an ordinary email address unchanged', () => {
    expect(escapeHtml('writer@example.com')).toBe('writer@example.com')
  })

  it('neutralizes a script-tag injection attempt (the audit finding #24 scenario)', () => {
    const malicious = '"><script>alert(document.cookie)</script>@evil.com'
    const escaped = escapeHtml(malicious)
    expect(escaped).not.toContain('<script>')
    expect(escaped).not.toContain('">')
    expect(escaped).toBe('&quot;&gt;&lt;script&gt;alert(document.cookie)&lt;/script&gt;@evil.com')
  })

  it('coerces a non-string value rather than throwing', () => {
    expect(escapeHtml(undefined)).toBe('undefined')
  })
})
