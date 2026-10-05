// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function load(desktop, invoke) {
  if (desktop) vi.stubGlobal('__TAURI__', { core: { invoke } })
  return import('./externalLinks.js')
}

describe('isExternalUrl', () => {
  it('treats other-origin https and mailto as external, same-origin and http as not', async () => {
    const { isExternalUrl } = await load(false)
    expect(isExternalUrl('https://ko-fi.com/yow', 'https://app.example/')).toBe(true)
    expect(isExternalUrl('mailto:support@yourownworld.co.uk', 'https://app.example/')).toBe(true)
    expect(isExternalUrl('https://app.example/pricing', 'https://app.example/')).toBe(false)
    expect(isExternalUrl('/pricing', 'https://app.example/')).toBe(false)
    expect(isExternalUrl('http://insecure.example', 'https://app.example/')).toBe(false)
    expect(isExternalUrl('javascript:alert(1)', 'https://app.example/')).toBe(false)
  })
})

describe('desktop external links', () => {
  it('opens an external anchor through the native command and cancels the webview navigation', async () => {
    const invoke = vi.fn(async () => {})
    const { installDesktopExternalLinkHandler } = await load(true, invoke)
    const uninstall = installDesktopExternalLinkHandler()
    document.body.innerHTML = '<a id="a" href="https://platform.openai.com/keys" target="_blank"><span id="s">Get a key</span></a>'
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    document.getElementById('s').dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(invoke).toHaveBeenCalledWith('open_external_url', { url: 'https://platform.openai.com/keys' })
    uninstall()
  })

  it('leaves in-app anchors alone', async () => {
    const invoke = vi.fn(async () => {})
    const { installDesktopExternalLinkHandler } = await load(true, invoke)
    const uninstall = installDesktopExternalLinkHandler()
    document.body.innerHTML = '<a id="a" href="#section">x</a>'
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    document.getElementById('a').dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(invoke).not.toHaveBeenCalled()
    uninstall()
  })

  it('does not install in a normal browser', async () => {
    const { installDesktopExternalLinkHandler } = await load(false)
    installDesktopExternalLinkHandler()
    document.body.innerHTML = '<a id="a" href="https://example.org">x</a>'
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    document.getElementById('a').dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })

  it('navigateToExternalUrl hands billing redirects to the OS browser on desktop', async () => {
    const invoke = vi.fn(async () => {})
    const { navigateToExternalUrl } = await load(true, invoke)
    await expect(navigateToExternalUrl('https://checkout.stripe.com/c/pay/x')).resolves.toBe('external')
    expect(invoke).toHaveBeenCalledWith('open_external_url', { url: 'https://checkout.stripe.com/c/pay/x' })
  })

  it('reports failure when the native command rejects', async () => {
    const invoke = vi.fn(async () => { throw new Error('nope') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { navigateToExternalUrl } = await load(true, invoke)
    await expect(navigateToExternalUrl('https://checkout.stripe.com/c/pay/x')).resolves.toBe('failed')
  })
})
