import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { submitFeedback } from '../../utils/feedback'

const fieldStyle = {
  width: '100%',
  background: 'var(--bg-main)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '9px 12px',
  fontSize: 13,
  color: 'var(--text-main)',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
}

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: 6,
}

function SupportForm({ user, onClose }) {
  const [form, setForm] = useState({ firstName: '', message: '' })
  const [status, setStatus] = useState('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const update = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus('sending')
    setErrorMsg('')
    try {
      await submitFeedback({
        type:    'support',
        title:   `Support request from ${form.firstName || user?.email || 'user'}`,
        message: form.message,
        name:    form.firstName || null,
        email:   user?.email || null,
        userId:  user?.id || null,
      })
      setStatus('done')
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{ fontSize: 36, marginBottom: 14 }}>✓</div>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)', marginBottom: 8 }}>Message received</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 20 }}>
          We'll get back to you at <strong style={{ color: 'var(--text-main)' }}>{user?.email}</strong> as soon as we can.
        </p>
        <button
          onClick={onClose}
          style={{
            padding: '9px 20px', borderRadius: 6,
            background: 'var(--accent)', color: 'var(--accent-contrast)',
            border: 'none', fontWeight: 800, fontSize: 12,
            letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Done
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <label htmlFor="help-firstname" style={labelStyle}>First name</label>
          <input
            id="help-firstname"
            type="text"
            placeholder="Your first name"
            value={form.firstName}
            onChange={update('firstName')}
            style={fieldStyle}
          />
        </div>
        <div>
          <label htmlFor="help-email" style={labelStyle}>Email</label>
          <input
            id="help-email"
            type="email"
            value={user?.email || ''}
            readOnly
            style={{ ...fieldStyle, opacity: 0.6, cursor: 'default' }}
          />
        </div>
      </div>

      <div>
        <label htmlFor="help-message" style={labelStyle}>Message</label>
        <textarea
          id="help-message"
          required
          placeholder="Describe your issue or question…"
          value={form.message}
          onChange={update('message')}
          rows={5}
          style={{ ...fieldStyle, resize: 'vertical', minHeight: 100 }}
        />
      </div>

      {status === 'error' && (
        <p style={{ fontSize: 12, color: 'var(--danger, #ef4444)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '8px 12px' }}>
          {errorMsg}
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '9px 16px', borderRadius: 6,
            background: 'transparent', color: 'var(--text-muted)',
            border: '1px solid var(--border)', fontWeight: 700, fontSize: 12,
            letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={status === 'sending'}
          style={{
            padding: '9px 20px', borderRadius: 6,
            background: 'var(--accent)', color: 'var(--accent-contrast)',
            border: 'none', fontWeight: 800, fontSize: 12,
            letterSpacing: '.06em', textTransform: 'uppercase', cursor: status === 'sending' ? 'default' : 'pointer',
            opacity: status === 'sending' ? 0.7 : 1, fontFamily: 'inherit',
          }}
        >
          {status === 'sending' ? 'Sending…' : 'Send message'}
        </button>
      </div>
    </form>
  )
}

function SuggestionsForm({ user }) {
  const [form, setForm] = useState({ title: '', description: '', category: 'feature', email: '' })
  const [status, setStatus] = useState('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const update = (field) => (e) => setForm(p => ({ ...p, [field]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus('sending')
    setErrorMsg('')
    try {
      await submitFeedback({
        type:     'feature_request',
        title:    form.title,
        message:  form.description,
        category: form.category,
        email:    user?.email || form.email || null,
        userId:   user?.id || null,
      })
      setStatus('done')
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{ fontSize: 36, marginBottom: 16 }}>✓</div>
        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)', marginBottom: 8 }}>Request received — thank you!</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.65, marginBottom: 20 }}>
          We read every request. Popular ideas shape what we build next.
        </p>
        <button
          type="button"
          onClick={() => { setStatus('idle'); setForm({ title: '', description: '', category: 'feature', email: '' }) }}
          style={{ padding: '9px 20px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--accent-contrast)', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Submit another
        </button>
      </div>
    )
  }

  return (
    <div>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 20 }}>
        Have an idea for a feature, or something that should work differently? We read every request.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label>
          <span style={labelStyle}>Feature title</span>
          <input
            type="text"
            required
            placeholder="Short name for your idea"
            value={form.title}
            onChange={update('title')}
            style={fieldStyle}
          />
        </label>

        <label>
          <span style={labelStyle}>Category</span>
          <select value={form.category} onChange={update('category')} style={fieldStyle}>
            <option value="feature">New feature</option>
            <option value="improvement">Improvement to existing feature</option>
            <option value="ai">AI assistant</option>
            <option value="accessibility">Accessibility</option>
            <option value="export">Export / import</option>
            <option value="mobile">Mobile experience</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label>
          <span style={labelStyle}>Description</span>
          <textarea
            required
            placeholder="Describe the feature and why it would help your writing process…"
            value={form.description}
            onChange={update('description')}
            rows={5}
            style={{ ...fieldStyle, resize: 'vertical', minHeight: 96 }}
          />
        </label>

        {!user && (
          <label>
            <span style={labelStyle}>Your email (optional)</span>
            <input
              type="email"
              placeholder="so we can follow up if needed"
              value={form.email}
              onChange={update('email')}
              style={fieldStyle}
            />
          </label>
        )}

        {status === 'error' && (
          <p style={{ fontSize: 12, color: 'var(--danger, #ef4444)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '8px 12px' }}>
            {errorMsg}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
          <button
            type="submit"
            disabled={status === 'sending'}
            style={{
              padding: '9px 20px', borderRadius: 6, border: 'none',
              background: 'var(--accent)', color: 'var(--accent-contrast)',
              fontSize: 12, fontWeight: 800, cursor: status === 'sending' ? 'default' : 'pointer',
              opacity: status === 'sending' ? 0.7 : 1, fontFamily: 'inherit',
            }}
          >
            {status === 'sending' ? 'Sending…' : 'Send request'}
          </button>
        </div>
      </form>
    </div>
  )
}

const TABS = [
  { id: 'support', label: 'Support' },
  { id: 'suggestions', label: 'Suggestions' },
]

export default function HelpContact({ open, onClose }) {
  const { user } = useAuth()
  const [tab, setTab] = useState('support')
  const dialogRef = useRef(null)
  useEffect(() => { if (open) dialogRef.current?.focus() }, [open])
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleClose = () => {
    setTab('support')
    onClose()
  }

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-modal-title"
        tabIndex={-1}
        style={{
          background: 'var(--bg-nav)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          width: 'min(500px, 100%)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.45)',
          overflow: 'hidden',
        }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3 }}>
                Get in touch
              </p>
              <p id="help-modal-title" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)' }}>Help &amp; Support</p>
            </div>
            <div style={{ display: 'flex', gap: 2 }}>
              {TABS.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  style={{
                    padding: '5px 12px', borderRadius: 6,
                    border: `1px solid ${tab === t.id ? 'var(--accent)' : 'var(--border)'}`,
                    background: tab === t.id ? 'var(--accent-fade)' : 'transparent',
                    color: tab === t.id ? 'var(--accent)' : 'var(--text-muted)',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 24 }}>
          {tab === 'support'     && <SupportForm user={user} onClose={handleClose} />}
          {tab === 'suggestions' && <SuggestionsForm user={user} />}
        </div>
      </div>
    </div>
  )
}
