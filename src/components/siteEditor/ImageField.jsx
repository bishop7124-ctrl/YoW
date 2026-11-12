import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from '../../supabase'
import { BUILT_IN_IMAGES } from '../../content/siteImages'
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, safeFileName } from './fieldTreeUtils'
import { verifyImageFile } from '../../utils/fileSignature'

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--bg-card)', color: 'var(--text-main)', fontSize: 13, fontFamily: 'inherit',
}
const labelStyle = { display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }

function measure(url) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => resolve(null)
    img.src = url
  })
}

// Swap a screenshot: pick a built-in one, a previous upload, or upload a new
// file to the editor-only `site-media` bucket.
export default function ImageField({ label, value, onChange, ctx }) {
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [uploads, setUploads] = useState([])
  const activeRef = useRef(false)
  const requestRef = useRef(0)
  const latestRef = useRef({ value, onChange, ctx })

  useLayoutEffect(() => {
    activeRef.current = true
    return () => { activeRef.current = false; requestRef.current += 1 }
  }, [])

  useLayoutEffect(() => {
    // Array rows reuse component positions after removal/reordering. A different
    // image value (including a later alt edit) must invalidate the former request.
    if (latestRef.current.value !== value) {
      requestRef.current += 1
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
    // A sibling edit retains this image's identity but changes the parent merge
    // callback. Applying through the latest callback preserves that newer text.
    latestRef.current = { value, onChange, ctx }
  }, [value, onChange, ctx])

  useEffect(() => {
    let cancelled = false
    ctx.listUploads().then(list => { if (!cancelled) setUploads(list) })
    return () => { cancelled = true }
  }, [ctx])

  const beginRequest = () => {
    const request = { id: ++requestRef.current, value: latestRef.current.value }
    setError('')
    setBusy(false)
    return request
  }
  const isCurrent = (request) => activeRef.current && requestRef.current === request.id && latestRef.current.value === request.value

  const apply = async (src, request = beginRequest()) => {
    const size = src ? await measure(src) : null
    if (!isCurrent(request)) return false
    latestRef.current.onChange({ ...request.value, src, ...(size || {}) })
    return true
  }

  const upload = async (file) => {
    if (!file) return
    const request = beginRequest()
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) { setError('Use a PNG, JPG, WebP or GIF image.'); return }
    if (file.size > MAX_IMAGE_BYTES) { setError('That image is over 5 MB. Please compress it first.'); return }
    setBusy(true)
    try {
      // The type and name a browser reports are only labels. Check the file's own bytes before it is stored.
      const checked = await verifyImageFile(file, ALLOWED_IMAGE_TYPES)
      if (!isCurrent(request)) return
      if (!checked.ok) { setError('That file is not a valid PNG, JPG, WebP or GIF image.'); return }
      const ext = checked.type === 'image/jpeg' ? 'jpg' : checked.type.split('/')[1]
      const path = `uploads/${Date.now()}-${safeFileName(file.name)}.${ext}`
      const { error: upErr } = await supabase.storage.from('site-media').upload(path, file, {
        contentType: checked.type, cacheControl: '31536000', upsert: false,
      })
      if (!isCurrent(request)) return
      if (upErr) throw upErr
      const { data } = supabase.storage.from('site-media').getPublicUrl(path)
      if (await apply(data.publicUrl, request)) latestRef.current.ctx.refreshUploads()
    } catch (e) {
      if (isCurrent(request)) setError(`Upload failed: ${e.message || 'unknown error'}`)
    } finally {
      if (isCurrent(request)) {
        setBusy(false)
        if (fileRef.current) fileRef.current.value = ''
      }
    }
  }

  const options = [
    ...BUILT_IN_IMAGES.map(i => ({ ...i, group: 'Built-in screenshots' })),
    ...uploads.map(u => ({ label: u.name.replace(/^\d+-/, ''), src: u.url, group: 'Your uploads' })),
  ]
  const current = options.find(o => o.src === value.src)

  return (
    <div style={{ marginBottom: 16 }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'var(--bg-main)' }}>
        {value.src
          ? <img src={value.src} alt="" style={{ display: 'block', maxWidth: '100%', maxHeight: 180, borderRadius: 6, marginBottom: 10, border: '1px solid var(--border)' }} />
          : <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px' }}>No image set.</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Uploading…' : 'Upload new image'}
          </button>
          <input ref={fileRef} type="file" accept={ALLOWED_IMAGE_TYPES.join(',')} hidden onChange={e => upload(e.target.files?.[0])} />
          {value.src && <button type="button" className="btn btn-secondary btn-sm" onClick={() => apply('')}>Remove</button>}
          <select
            aria-label="Choose an existing image"
            value={current ? current.src : ''}
            onChange={e => e.target.value && apply(e.target.value)}
            style={{ ...inputStyle, width: 'auto', flex: 1, minWidth: 160 }}
          >
            <option value="">Choose existing…</option>
            {['Built-in screenshots', 'Your uploads'].map(group => {
              const items = options.filter(o => o.group === group)
              return items.length ? (
                <optgroup key={group} label={group}>
                  {items.map(o => <option key={o.src} value={o.src}>{o.label}</option>)}
                </optgroup>
              ) : null
            })}
          </select>
        </div>
        <label style={{ display: 'block' }}>
          <span style={labelStyle}>Image description (for screen readers and search)</span>
          <input value={value.alt || ''} onChange={e => onChange({ ...value, alt: e.target.value })} style={inputStyle} />
        </label>
        {error && <p role="alert" style={{ color: '#c0564f', fontSize: 12, margin: '8px 0 0' }}>{error}</p>}
      </div>
    </div>
  )
}
