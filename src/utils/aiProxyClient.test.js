import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('../supabase', () => ({ supabase: { auth: { getSession } } }))
vi.mock('./offlineMock', () => ({ OFFLINE_MODE: false }))
import { fetchOpenAIModels, streamMessage } from './aiApi'

beforeEach(() => {
  getSession.mockResolvedValue({ data: { session: { access_token: 'session-token' } } })
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => vi.unstubAllGlobals())

describe('authenticated named-provider AI transport', () => {
  it('sends the session token to YOW when loading a private model catalog', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: 'model' }] }) })
    await expect(fetchOpenAIModels('provider-key-catalog')).resolves.toEqual([{ id: 'model', label: 'model' }])
    expect(fetch).toHaveBeenCalledWith('/api/ai-proxy', expect.objectContaining({
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer session-token' },
    }))
    expect(JSON.parse(fetch.mock.calls[0][1].body).apiKey).toBe('provider-key-catalog')
  })
  it('authenticates streaming and returns generated text', async () => {
    fetch.mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: {"choices":[{"finish_reason":"stop"}]}\n\n'))
    const onChunk = vi.fn(), onDone = vi.fn(), onError = vi.fn()
    await streamMessage({ provider: 'openai', apiKey: 'provider-key', messages: [], onChunk, onDone, onError })
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer session-token')
    expect(onChunk).toHaveBeenCalledWith('Hello')
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })
  it('does not send provider credentials when signed out', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    await expect(fetchOpenAIModels('signed-out-key')).rejects.toThrow('sign in to YOW')
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each(['https://custom.example/v1', 'http://localhost:11434/v1', 'https://api.openai.com/v1?custom=1', 'https://user:pass@api.openai.com/v1'])(
    'blocks both model lookup and chat for a saved custom endpoint: %s', async (baseUrl) => {
      await expect(fetchOpenAIModels('provider-key', baseUrl)).rejects.toThrow('Custom AI endpoints')
      const onError = vi.fn()
      await streamMessage({ provider: 'openai', apiKey: 'provider-key', baseUrl, onError })
      expect(onError).toHaveBeenCalledWith(expect.stringContaining('Custom AI endpoints'))
      expect(fetch).not.toHaveBeenCalled()
    })
})
