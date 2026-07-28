import { beforeEach, describe, expect, it, vi } from 'vitest'

const tableResults = []
const queueResult = (result) => tableResults.push(result)
const makeBuilder = () => {
  const builder = {}
  for (const method of ['select', 'eq', 'maybeSingle', 'delete', 'upsert']) {
    builder[method] = vi.fn(() => builder)
  }
  builder.then = (resolve, reject) => {
    const result = tableResults.shift() || { data: null, error: null }
    return Promise.resolve(result).then(resolve, reject)
  }
  return builder
}

const getUser = vi.fn()
const from = vi.fn(() => makeBuilder())
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser }, from }),
}))

const makeRes = () => ({
  setHeader: vi.fn(),
  status: vi.fn().mockReturnThis(),
  json: vi.fn(),
  end: vi.fn(),
})

const makeReq = (overrides = {}) => ({
  method: 'GET',
  headers: { authorization: 'Bearer test-token' },
  body: undefined,
  ...overrides,
})

const settings = {
  activeProvider: 'openrouter',
  google: { apiKey: '', model: 'gemini-2.0-flash' },
  anthropic: { apiKey: '', model: 'claude-sonnet-4-6' },
  openrouter: { apiKey: 'sk-or-secret', model: 'google/gemma-3-27b-it' },
  openai: { apiKey: '', model: '', baseUrl: 'https://api.openai.com/v1' },
}

describe('ai-settings handler', () => {
  let handler, encryptSettings, decryptSettings

  beforeEach(async () => {
    process.env.SUPABASE_URL = 'https://stub.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key'
    process.env.AI_SETTINGS_ENCRYPTION_KEY = 'test-encryption-secret'
    getUser.mockReset()
    from.mockClear()
    tableResults.length = 0
    vi.resetModules()
    const mod = await import('./ai-settings.js')
    handler = mod.default
    encryptSettings = mod.encryptSettings
    decryptSettings = mod.decryptSettings
  })

  it('round-trips settings through AES-GCM encryption', () => {
    const payload = encryptSettings(settings)
    expect(payload.ciphertext).not.toContain('sk-or-secret')
    expect(decryptSettings(payload)).toEqual(settings)
  })

  it('requires authentication', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('bad token') })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('returns exists false when no synced settings are stored', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    queueResult({ data: null, error: null })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ exists: false })
  })

  it('saves sanitized encrypted settings', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    queueResult({ data: null, error: null })
    const res = makeRes()
    await handler(makeReq({ method: 'POST', body: { settings } }), res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(from).toHaveBeenCalledWith('synced_ai_settings')
  })

  it('loads and decrypts stored settings', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    queueResult({
      data: { encrypted_payload: encryptSettings(settings), updated_at: '2026-07-27T12:00:00Z' },
      error: null,
    })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json.mock.calls[0][0]).toMatchObject({ exists: true, settings })
  })

  it('deletes synced settings', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    queueResult({ data: null, error: null })
    const res = makeRes()
    await handler(makeReq({ method: 'DELETE' }), res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ deleted: true })
  })
})
