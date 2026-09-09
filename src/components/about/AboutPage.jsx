import { useEffect, useRef } from 'react'
import SupportDevelopmentLink from '../marketing/SupportDevelopmentLink'

function AboutTab() {
  return (
    <div style={{ maxWidth: 560 }}>
      <p style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 12 }}>Your Own World</p>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-main)', marginBottom: 16, lineHeight: 1.3, fontFamily: 'var(--font-serif, Georgia, serif)' }}>
        A focused workspace for story worlds.
      </h2>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.75, marginBottom: 20 }}>
        Your Own World is a creative platform built for writers who need more than a blank document. It keeps your manuscript, characters, maps, lore, timelines, and story structure in one interconnected workspace, so you can stay inside the world you're building rather than juggling separate tools.
      </p>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.75, marginBottom: 28 }}>
        The AI assistant is built directly into each section of the studio — not a chatbot bolted on the side, but a context-aware collaborator that knows which character you're working on, which chapter you're in, and what your world's lore says. It's there when you need it and out of the way when you don't.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Draft', desc: 'Full manuscript editor with scenes, chapters, and acts.' },
          { label: 'Plan', desc: 'Outlines, beat boards, idea capture, and writing schedules.' },
          { label: 'Cast', desc: 'Character dossiers, relationships, factions, and family trees.' },
          { label: 'World', desc: 'Locations, lore, maps, timelines, and world history.' },
          { label: 'Track', desc: 'Word counts, pacing, goals, and project momentum.' },
          { label: 'Assist', desc: 'AI that knows your project and helps at every step.' },
        ].map(({ label, desc }) => (
          <div key={label} style={{ padding: '14px 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-main)' }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)', marginBottom: 4 }}>{label}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{desc}</p>
          </div>
        ))}
      </div>

      <div style={{ padding: '16px 20px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-main)', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-main)', marginBottom: 3 }}>Made by writers, for writers</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Your Own World is built by a small team that writes. We use YOW ourselves. Use the <strong style={{ color: 'var(--text-main)' }}>Help &amp; Support</strong> option in your account menu to send ideas or get direct assistance.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function AboutPage({ open, onClose }) {
  const dialogRef = useRef(null)
  useEffect(() => { if (open) dialogRef.current?.focus() }, [open])
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 8000,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-modal-title"
        tabIndex={-1}
        style={{
          background: 'var(--bg-nav)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          width: 'min(680px, 100%)',
          maxHeight: 'min(820px, calc(100vh - 48px))',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 10px 50px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 2 }}>Your Own World</p>
            <p id="about-modal-title" style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-main)' }}>About Your Own World</p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '2px 4px' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
          <AboutTab />
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 12, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>© 2026 YourOwnWorld. All rights reserved.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <a href="mailto:support@yourownworld.co.uk" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>support@yourownworld.co.uk</a>
            <SupportDevelopmentLink />
          </div>
        </div>
      </div>
    </div>
  )
}
