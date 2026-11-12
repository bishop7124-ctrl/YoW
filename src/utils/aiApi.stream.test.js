// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 't' } }, error: null }) } } }))
vi.mock('./offlineMock', () => ({ OFFLINE_MODE: false, mockStreamMessage: vi.fn() }))
import { STREAM_BLOCKED_TEXT, STREAM_INCOMPLETE_TEXT, STREAM_LENGTH_TEXT, streamMessage } from './aiApi'

const sse = (...events) => events.map(e => (e === '[DONE]' ? 'data: [DONE]\n\n' : `data: ${JSON.stringify(e)}\n\n`)).join('')
const respond = text => {
  const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(text)); controller.close() } })
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, body, headers: new Headers() })))
}

// Runs one stream to its end and reports exactly which callbacks fired.
async function run(provider, text) {
  respond(text)
  const log = { chunks: [], done: 0, errors: [], incomplete: [], usage: [] }
  await new Promise(resolve => {
    const finish = () => setTimeout(resolve, 0)
    streamMessage({
      provider, apiKey: 'k', model: 'm', systemPrompt: 's', messages: [{ role: 'user', content: 'hi' }],
      onChunk: c => log.chunks.push(c),
      onDone: () => { log.done += 1; finish() },
      onError: e => { log.errors.push(e); finish() },
      onIncomplete: r => { log.incomplete.push(r); finish() },
      onUsage: u => log.usage.push(u),
    })
  })
  return log
}

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}) })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

const oa = (delta, finish) => ({ choices: [{ delta: { content: delta }, finish_reason: finish ?? null }] })

describe('stream endings (audit AUD-28)', () => {
  it('OpenAI-style: a normal stop is complete, and usage sent AFTER the stop chunk is still captured', async () => {
    const log = await run('openrouter', sse(oa('Hello'), oa(' world', 'stop'), { usage: { prompt_tokens: 5, completion_tokens: 2 } }, '[DONE]'))
    expect(log).toMatchObject({ chunks: ['Hello', ' world'], done: 1, errors: [], incomplete: [] })
    expect(log.usage).toHaveLength(1)
  })

  it('OpenAI-style: hitting the length limit is reported as incomplete, not as a normal completion', async () => {
    const log = await run('openrouter', sse(oa('Cut'), oa(' off', 'length'), '[DONE]'))
    expect(log.done).toBe(0)
    expect(log.incomplete).toEqual([STREAM_LENGTH_TEXT])
  })

  it('OpenAI-style: a stream that just ends with no stop is incomplete; the [DONE] marker alone counts as a clean end', async () => {
    expect((await run('openrouter', sse(oa('partial')))).incomplete).toEqual([STREAM_INCOMPLETE_TEXT])
    expect((await run('openrouter', sse(oa('whole'), '[DONE]'))).done).toBe(1)
  })

  it('OpenAI-style: a provider error event in the middle is an error, and a content filter stop is incomplete', async () => {
    const errored = await run('openrouter', sse(oa('Hi'), { error: { code: 500, message: 'upstream failed' } }))
    expect(errored.errors).toHaveLength(1)
    expect(errored.done).toBe(0)
    const filtered = await run('openrouter', sse(oa('Hi', 'content_filter')))
    expect(filtered.incomplete).toEqual([STREAM_BLOCKED_TEXT])
  })

  it('Anthropic: message_stop is complete; max_tokens, an error event, and an interrupted stream are not', async () => {
    const start = { type: 'message_start' }
    const text = t => ({ type: 'content_block_delta', delta: { type: 'text_delta', text: t } })
    const ok = await run('anthropic', sse(start, text('Hi'), { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } }, { type: 'message_stop' }))
    expect(ok).toMatchObject({ chunks: ['Hi'], done: 1, errors: [], incomplete: [] })
    expect(ok.usage).toHaveLength(1)
    const length = await run('anthropic', sse(start, text('Hi'), { type: 'message_delta', delta: { stop_reason: 'max_tokens' } }, { type: 'message_stop' }))
    expect(length.incomplete).toEqual([STREAM_LENGTH_TEXT])
    const errored = await run('anthropic', sse(start, text('Hi'), { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }))
    expect(errored.errors).toHaveLength(1)
    expect(errored.done).toBe(0)
    const cut = await run('anthropic', sse(start, text('Hi')))
    expect(cut.incomplete).toEqual([STREAM_INCOMPLETE_TEXT])
  })

  it('Google: STOP is complete; MAX_TOKENS, SAFETY, an error event and an interrupted stream are not', async () => {
    const part = (t, finishReason) => ({ candidates: [{ content: { parts: [{ text: t }] }, ...(finishReason ? { finishReason } : {}) }] })
    expect((await run('google', sse(part('Hi'), part(' there', 'STOP')))).done).toBe(1)
    expect((await run('google', sse(part('Hi', 'MAX_TOKENS')))).incomplete).toEqual([STREAM_LENGTH_TEXT])
    expect((await run('google', sse(part('Hi', 'SAFETY')))).incomplete).toEqual([STREAM_BLOCKED_TEXT])
    expect((await run('google', sse(part('Hi'), { error: { code: 503, message: 'unavailable' } }))).errors).toHaveLength(1)
    expect((await run('google', sse(part('Hi')))).incomplete).toEqual([STREAM_INCOMPLETE_TEXT])
  })

  it('falls back to onError when the caller has no onIncomplete, so no caller is told an incomplete reply succeeded', async () => {
    respond(sse(oa('partial')))
    const errors = []
    let done = 0
    await new Promise(resolve => streamMessage({
      provider: 'openrouter', apiKey: 'k', model: 'm', systemPrompt: 's', messages: [{ role: 'user', content: 'hi' }],
      onChunk: () => {}, onDone: () => { done += 1; resolve() }, onError: e => { errors.push(e); resolve() },
    }))
    expect(done).toBe(0)
    expect(errors).toEqual([STREAM_INCOMPLETE_TEXT])
  })
})
