import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabase'
import { BUILT_IN_IMAGES } from '../../content/siteImages'
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, safeFileName } from './fieldTreeUtils'

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

  useEffect(() => {
    let cancelled = false
    ctx.listUploads().then(list => { if (!cancelled) setUploads(list) })
    return () => { cancelled = true }
  }, [ctx])

  const apply = async (src) => {
    const size = src ? await measure(src) : null
    onChange({ ...value, src, ...(size || {}) })
  }

  const upload = async (file) => {
    setError('')
    if (!file) return
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) { setError('Use a PNG, JPG, WebP or GIF image.'); return }
    if (file.size > MAX_IMAGE_BYTES) { setError('That image is over 5 MB. Please compress it first.'); return }
    setBusy(true)
    try {
      const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]
      const path = `uploads/${Date.now()}-${safeFileName(file.name)}.${ext}`
      const { error: upErr } = await supabase.storage.from('site-media').upload(path, file, {
        contentType: file.type, cacheControl: '31536000', upsert: false,
      })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('site-media').getPublicUrl(path)
      await apply(data.publicUrl)
      ctx.refreshUploads()
    } catch (e) {
      setError(`Upload failed: ${e.message || 'unknown error'}`)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
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
