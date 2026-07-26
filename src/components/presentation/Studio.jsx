import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import YOWLogo from '../brand/YOWLogo'
import { useIsMobile, useIsPhone, isMobileViewport } from '../../utils/useMediaQuery'

const cx = (...classes) => classes.filter(Boolean).join(' ')

function RoomMenuIcon({ open }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="3" y1="7" x2="21" y2="7" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="17" x2="21" y2="17" /></svg>
  )
}

export function StudioFrame({
  projectTitle,
  projectType,
  rooms,
  activeRoomId,
  onOpenRoom,
  themeTray,
  primaryAction,
  account,
  contextRail,
  contextRailOpen = true,
  onToggleContextRail,
  topBar,
  utilityContent,
  onGoHome,
  children,
}) {
  const [roomMenuOpen, setRoomMenuOpen] = useState(false)
  const [roomMenuCoords, setRoomMenuCoords] = useState(null)
  const hamburgerRef = useRef(null)
  const roomMenuRef = useRef(null)
  const activeRoom = rooms.find(room => room.id === activeRoomId) || rooms[0]

  // Portaled to <body> (coords set inline from the hamburger's rect) for the same
  // reason as the account menu: .studio-spine clips overflow on mobile to keep the
  // app chrome compact, so an in-place dropdown would get clipped to the header.
  const updateRoomMenuCoords = () => {
    const rect = hamburgerRef.current?.getBoundingClientRect()
    if (!rect) return
    setRoomMenuCoords({ top: rect.bottom + 6, left: 8, right: 8 })
  }

  useEffect(() => {
    if (!roomMenuOpen) return undefined
    updateRoomMenuCoords()
    window.addEventListener('resize', updateRoomMenuCoords)
    window.addEventListener('scroll', updateRoomMenuCoords, true)
    return () => {
      window.removeEventListener('resize', updateRoomMenuCoords)
      window.removeEventListener('scroll', updateRoomMenuCoords, true)
    }
  }, [roomMenuOpen])

  useEffect(() => {
    const handler = (e) => {
      if (hamburgerRef.current?.contains(e.target)) return
      if (roomMenuRef.current?.contains(e.target)) return
      setRoomMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => { setRoomMenuOpen(false) }, [activeRoomId])

  return (
    <div className={cx('studio-shell', topBar && 'has-top-bar', !contextRail && 'has-no-context', contextRail && !contextRailOpen && 'is-context-collapsed')}>
      {topBar && <div className="studio-top-bar">{topBar}</div>}

      <header className="studio-spine" aria-label="Studio navigation">
        <div className="studio-brand" title={`${projectTitle} - ${projectType}`}>
          <div
            className={`studio-brand-mark${onGoHome ? ' studio-brand-mark-link' : ''}`}
            role={onGoHome ? 'button' : undefined}
            tabIndex={onGoHome ? 0 : undefined}
            aria-label={onGoHome ? 'Back to library' : undefined}
            onClick={onGoHome}
            onKeyDown={onGoHome ? (e) => { if (e.key === 'Enter' || e.key === ' ') onGoHome() } : undefined}
          ><YOWLogo /></div>
          <div className="studio-brand-mobile-label" aria-hidden="true">
            <span>YOW</span>
            <span className="beta-watermark">Beta</span>
          </div>
          <div className="studio-brand-text">
            <div className="studio-brand-name-stack" aria-label="Your Own World">
              <span><strong>Y</strong>our</span>
              <span><strong>O</strong>wn</span>
              <span><strong>W</strong>orld</span>
            </div>
            <span className="beta-watermark" aria-label="Beta">Beta</span>
            <span className="studio-brand-sep">·</span>
            <h1>{projectTitle}</h1>
            {projectType && (
              <span className="studio-project-type-badge" title={projectType}>
<span>{projectType}</span>
              </span>
            )}
          </div>
          {primaryAction && (
            <div className="studio-primary-action">
              {primaryAction}
            </div>
          )}
        </div>

        {primaryAction && (
          <div className="studio-mobile-primary-action">
            {primaryAction}
          </div>
        )}

        <nav className="studio-room-list" aria-label="Workspace">
          {rooms.map(room => (
            <button
              key={room.id}
              type="button"
              onClick={() => onOpenRoom(room)}
              className={cx('studio-room', activeRoomId === room.id && 'is-current', room.locked && 'is-locked')}
              aria-label={`Open ${room.label}`}
              aria-current={activeRoomId === room.id ? true : undefined}
              title={room.locked ? `${room.label}: paid feature` : room.description ? `${room.label}: ${room.description}` : room.label}
            >
              <span className="studio-room-tab">{room.icon}</span>
              <span className="studio-room-copy">
                <strong>{room.label}{room.locked ? <span className="studio-lock-label">Locked</span> : null}</strong>
                <small>{room.locked ? 'Paid feature' : room.description}</small>
              </span>
            </button>
          ))}
        </nav>

        <button
          type="button"
          ref={hamburgerRef}
          className="studio-room-hamburger"
          aria-label={roomMenuOpen ? 'Close section menu' : 'Open section menu'}
          aria-haspopup="menu"
          aria-expanded={roomMenuOpen}
          onClick={() => setRoomMenuOpen(v => !v)}
        >
          <RoomMenuIcon open={roomMenuOpen} />
          {activeRoom && <span className="studio-room-hamburger-label">{activeRoom.label}</span>}
        </button>

        {roomMenuOpen && roomMenuCoords && createPortal(
          <nav
            ref={roomMenuRef}
            className="studio-room-menu-portal"
            aria-label="Workspace"
            style={{ top: roomMenuCoords.top, left: roomMenuCoords.left, right: roomMenuCoords.right }}
          >
            {rooms.map(room => (
              <button
                key={room.id}
                type="button"
                onClick={() => { onOpenRoom(room); setRoomMenuOpen(false) }}
                className={cx('studio-room-menu-item', activeRoomId === room.id && 'is-current', room.locked && 'is-locked')}
                aria-current={activeRoomId === room.id ? true : undefined}
              >
                <span className="studio-room-tab">{room.icon}</span>
                <span className="studio-room-copy">
                  <strong>{room.label}{room.locked ? <span className="studio-lock-label">Locked</span> : null}</strong>
                  <small>{room.locked ? 'Paid feature' : room.description}</small>
                </span>
              </button>
            ))}
          </nav>,
          document.body
        )}

        <div className="studio-utility">
          {themeTray && (
            <div className="studio-material-tray">
              {themeTray}
            </div>
          )}
          {utilityContent}
        </div>

        {account && <div className="studio-account-slot">{account}</div>}
      </header>

      {children}

      {contextRail && (
        <aside className={cx('studio-context-rail', !contextRailOpen && 'is-collapsed')}>
          <button
            type="button"
            className="context-rail-toggle"
            onClick={onToggleContextRail}
            aria-label={contextRailOpen ? 'Collapse quick actions' : 'Expand quick actions'}
            title={contextRailOpen ? 'Collapse' : 'Expand'}
          >
            {contextRailOpen ? '›' : '‹'}
          </button>
          {contextRailOpen && contextRail}
        </aside>
      )}
    </div>
  )
}

export function StudioWorkspace({
  tabs,
  roomId = 'studio',
  footer,
  children,
}) {
  return (
    <main className={cx('studio-workspace', `studio-workspace-${roomId}`, tabs && 'has-tabs')}>
      {tabs && (
        <nav className="studio-section-tabs" aria-label="Room sections">
          {tabs}
        </nav>
      )}

      <section className="studio-surface">
        {children}
      </section>

      {footer && (
        <div className="studio-workspace-footer">
          {footer}
        </div>
      )}
    </main>
  )
}

export function StudioTab({ active, className = '', children, ...props }) {
  return (
    <button type="button" className={cx('studio-tab', active && 'is-current', className)} aria-current={active ? true : undefined} {...props}>
      {children}
    </button>
  )
}

export function StudioButton({ tone = 'secondary', size = 'md', className = '', children, ...props }) {
  return (
    <button className={cx('studio-button', `studio-button-${tone}`, `studio-button-${size}`, className)} {...props}>
      {children}
    </button>
  )
}

export function StudioBoard({ children, className = '', variant = 'desk' }) {
  return <div className={cx('studio-board', `studio-board-${variant}`, className)}>{children}</div>
}

export function StudioSplit({ children, variant = 'notebook', ...rest }) {
  const [mobileIndexCollapsed, setMobileIndexCollapsed] = useState(false)
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!isMobile) setMobileIndexCollapsed(false)
  }, [isMobile])

  useEffect(() => {
    const handleReset = () => setMobileIndexCollapsed(false)
    window.addEventListener('studio-index-reset', handleReset)
    window.addEventListener('popstate', handleReset)
    return () => {
      window.removeEventListener('studio-index-reset', handleReset)
      window.removeEventListener('popstate', handleReset)
    }
  }, [])

  const handleClickCapture = (event) => {
    if (!isMobileViewport()) return
    if (event.target.closest?.('.studio-index .studio-record')) setMobileIndexCollapsed(true)
  }

  return (
    <div
      className={cx('studio-split', `studio-split-${variant}`, mobileIndexCollapsed && 'is-mobile-index-collapsed')}
      onClickCapture={handleClickCapture}
      {...rest}
    >
      {mobileIndexCollapsed && (
        <button
          type="button"
          className="studio-mobile-index-toggle"
          aria-expanded="false"
          onClick={() => setMobileIndexCollapsed(false)}
        >
          Browse list
        </button>
      )}
      {children}
    </div>
  )
}

export function StudioIndex({ eyebrow, title, tools, children, variant = 'index', ...rest }) {
  return (
    <aside className={cx('studio-index', `studio-index-${variant}`)} {...rest}>
      <div className="studio-index-head">
        <div>
          <p className="studio-kicker">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
        {tools && <div className="studio-index-tools">{tools}</div>}
      </div>
      <div className="studio-index-list">{children}</div>
    </aside>
  )
}

export function StudioRecord({ active, children, className = '', ...props }) {
  return (
    <button type="button" className={cx('studio-record', active && 'is-current', className)} aria-current={active ? true : undefined} {...props}>
      {children}
    </button>
  )
}

export function StudioDetail({ children, className = '', variant = 'paper' }) {
  return <article className={cx('studio-detail', `studio-detail-${variant}`, className)}>{children}</article>
}

export function StudioMetric({ label, value, detail, variant = 'note' }) {
  return (
    <div className={cx('studio-metric', `studio-metric-${variant}`)}>
      <p className="studio-kicker">{label}</p>
      <strong>{value}</strong>
      {detail && <span>{detail}</span>}
    </div>
  )
}

export function StudioEmpty({ title, body, action, variant = 'page' }) {
  return (
    <div className={cx('studio-empty', `studio-empty-${variant}`)}>
      <p className="studio-kicker">Blank surface</p>
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action && <div className="studio-empty-action">{action}</div>}
    </div>
  )
}

export function StudioSheet({ title, eyebrow = 'Editor', onClose, children, narrow = false, centered = false, closeOnBackdrop = true }) {
  const dialogRef = useRef(null)
  const pendingSubmitRef = useRef(false)
  const [dirty, setDirty] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const isPhone = useIsPhone()
  // iOS Safari has a long-standing, unfixed bug where focus()'s preventScroll
  // option is silently ignored (webkit.org/b/236584) — it scrolls/resizes the
  // visual viewport anyway, which is what was cutting off the top of this
  // sheet on phones. Escape-to-close still works via the window keydown
  // listener below without needing the sheet itself focused, so skip the
  // call on phone-width viewports rather than fight a bug WebKit hasn't fixed.
  useEffect(() => {
    if (!isPhone) dialogRef.current?.focus({ preventScroll: true })
  }, [isPhone])

  // TEMPORARY diagnostic — remove once the phone-modal-clipping bug is found.
  // Rendered via portal directly to <body> (outside the sheet's own possibly-
  // broken layout) so it stays visible no matter what the sheet is doing.
  const [debugInfo, setDebugInfo] = useState(null)
  useEffect(() => {
    if (!isPhone) return
    const measure = () => {
      const rect = dialogRef.current?.getBoundingClientRect()
      const cs = dialogRef.current ? getComputedStyle(dialogRef.current) : null
      setDebugInfo({
        innerWH: `${window.innerWidth}x${window.innerHeight}`,
        vv: window.visualViewport ? `${Math.round(window.visualViewport.width)}x${Math.round(window.visualViewport.height)} off=${Math.round(window.visualViewport.offsetTop)} scale=${window.visualViewport.scale}` : 'n/a',
        scrollY: window.scrollY,
        rect: rect ? `top=${Math.round(rect.top)} h=${Math.round(rect.height)} left=${Math.round(rect.left)} w=${Math.round(rect.width)}` : 'no dialogRef',
        pos: cs?.position,
        inset: cs ? `${cs.top}/${cs.right}/${cs.bottom}/${cs.left}` : '',
      })
    }
    measure()
    const t1 = setTimeout(measure, 300)
    const t2 = setTimeout(measure, 1000)
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('scroll', measure)
    return () => {
      clearTimeout(t1); clearTimeout(t2)
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('scroll', measure)
    }
  }, [isPhone])

  const requestClose = () => {
    if (dirty) {
      setConfirmClose(true)
      return
    }
    onClose()
  }

  useEffect(() => {
    const handler = (event) => {
      if (event.key === 'Escape') requestClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const discardAndClose = () => {
    setDirty(false)
    setConfirmClose(false)
    onClose()
  }

  const saveAndClose = () => {
    const form = dialogRef.current?.querySelector('form')
    if (!form) {
      discardAndClose()
      return
    }
    pendingSubmitRef.current = true
    form.requestSubmit()
  }

  const handleSubmitCapture = () => {
    pendingSubmitRef.current = false
    setDirty(false)
    setConfirmClose(false)
  }

  const handleInvalidCapture = () => {
    if (pendingSubmitRef.current) {
      pendingSubmitRef.current = false
      setConfirmClose(false)
    }
  }

  const handleClickCapture = (event) => {
    if (event.target.closest?.('.save-changes-prompt')) return
    const button = event.target.closest?.('button')
    if (!button || button.type !== 'button') return
    if (button.textContent?.trim().toLowerCase() !== 'cancel') return
    event.preventDefault()
    event.stopPropagation()
    requestClose()
  }

  return (
    <div
      className={cx('studio-sheet-backdrop', centered && 'is-centered', isPhone && 'is-mobile-sheet')}
      onClick={closeOnBackdrop ? requestClose : undefined}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-sheet-heading"
        tabIndex={-1}
        className={cx('studio-sheet', narrow && 'is-narrow', centered && 'is-centered', isPhone && 'is-mobile-sheet')}
        onClick={e => e.stopPropagation()}
        onClickCapture={handleClickCapture}
        onInputCapture={() => setDirty(true)}
        onChangeCapture={() => setDirty(true)}
        onSubmitCapture={handleSubmitCapture}
        onInvalidCapture={handleInvalidCapture}
      >
        <header>
          <div>
            <p className="studio-kicker">{eyebrow}</p>
            <h2 id="studio-sheet-heading">{title}</h2>
          </div>
          <button type="button" onClick={requestClose} aria-label="Close">×</button>
        </header>
        <div className="studio-sheet-body">{children}</div>
        {confirmClose && (
          <div className="save-changes-prompt" role="alertdialog" aria-modal="true" aria-labelledby="save-changes-title">
            <div className="save-changes-card">
              <p className="studio-kicker">Unsaved changes</p>
              <h3 id="save-changes-title">Save changes?</h3>
              <p>There are changes in this editor that have not been saved yet.</p>
              <div className="save-changes-actions">
                <button type="button" className="btn btn-primary" onClick={saveAndClose}>Save</button>
                <button type="button" className="btn btn-secondary" onClick={discardAndClose}>Discard</button>
                <button type="button" className="btn btn-secondary" onClick={() => setConfirmClose(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </section>
      {debugInfo && createPortal(
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 999999,
            background: '#ff00ff', color: '#000', fontSize: 10, lineHeight: 1.4,
            padding: '4px 6px', fontFamily: 'monospace', pointerEvents: 'none',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}
        >
          {`innerWH=${debugInfo.innerWH} vv=${debugInfo.vv} scrollY=${debugInfo.scrollY} pos=${debugInfo.pos} inset=${debugInfo.inset} rect: ${debugInfo.rect}`}
        </div>,
        document.body,
      )}
    </div>
  )
}

export function StudioPageHeader({ eyebrow, title, meta, actions, children }) {
  return (
    <header className="studio-page-header">
      <div className="min-w-0">
        <p className="studio-kicker">{eyebrow}</p>
        <h1>{title}</h1>
        {meta && <p>{meta}</p>}
        {children}
      </div>
      {actions && <div className="studio-page-actions">{actions}</div>}
    </header>
  )
}

export function StudioNote({ children, className = '' }) {
  return <div className={cx('studio-note', className)}>{children}</div>
}

export function StudioLedger({ children, className = '' }) {
  return <div className={cx('studio-ledger', className)}>{children}</div>
}
