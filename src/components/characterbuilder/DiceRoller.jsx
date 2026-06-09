import { useState, useEffect, useRef, useCallback } from 'react'

// ─── CSS keyframes injected once ─────────────────────────────────────────────

const STYLE = `
@keyframes dice-tumble {
  0%   { transform: rotate(0deg)    scale(1);    filter: blur(0px); }
  8%   { transform: rotate(-38deg)  scale(1.12); filter: blur(0.5px); }
  20%  { transform: rotate(155deg)  scale(0.88); filter: blur(1px); }
  33%  { transform: rotate(272deg)  scale(1.08); filter: blur(0.5px); }
  47%  { transform: rotate(198deg)  scale(0.94); filter: blur(0.8px); }
  60%  { transform: rotate(325deg)  scale(1.05); filter: blur(0.4px); }
  74%  { transform: rotate(12deg)   scale(0.97); filter: blur(0.3px); }
  86%  { transform: rotate(-8deg)   scale(1.02); filter: blur(0px); }
  100% { transform: rotate(0deg)    scale(1);    filter: blur(0px); }
}
@keyframes dice-land {
  0%   { transform: scale(1.2) rotate(-4deg); }
  40%  { transform: scale(0.88) rotate(2deg); }
  65%  { transform: scale(1.06) rotate(-1deg); }
  82%  { transform: scale(0.97) rotate(0.5deg); }
  100% { transform: scale(1) rotate(0deg); }
}
@keyframes dice-crit-glow {
  0%, 100% { filter: drop-shadow(0 0 6px #facc15) drop-shadow(0 0 16px #facc15); }
  50%       { filter: drop-shadow(0 0 12px #fef08a) drop-shadow(0 0 28px #facc15); }
}
@keyframes dice-fumble-shake {
  0%,100% { transform: translateX(0); }
  15%     { transform: translateX(-5px) rotate(-3deg); }
  30%     { transform: translateX(5px)  rotate(3deg); }
  45%     { transform: translateX(-4px) rotate(-2deg); }
  60%     { transform: translateX(4px)  rotate(2deg); }
  75%     { transform: translateX(-2px) rotate(-1deg); }
  90%     { transform: translateX(2px)  rotate(1deg); }
}
@keyframes die-appear {
  from { opacity: 0; transform: translateY(14px) scale(0.7); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
`

let styleInjected = false
function injectStyle() {
  if (styleInjected || typeof document === 'undefined') return
  const el = document.createElement('style')
  el.textContent = STYLE
  document.head.appendChild(el)
  styleInjected = true
}

// ─── Die shape definitions ────────────────────────────────────────────────────

// Returns the SVG path/polygon that forms the die outline (64×64 viewBox)
function DieShape({ sides, filled, color }) {
  const cx = 32, cy = 32
  const fillColor = filled ? `color-mix(in srgb, ${color} 18%, transparent)` : 'none'
  const strokeColor = color

  if (sides === 4) {
    // Equilateral triangle, flat bottom
    return <polygon points="32,5 59,55 5,55" fill={fillColor} stroke={strokeColor} strokeWidth="2.5" strokeLinejoin="round" />
  }
  if (sides === 6) {
    // Rounded square
    return <rect x="6" y="6" width="52" height="52" rx="9" fill={fillColor} stroke={strokeColor} strokeWidth="2.5" />
  }
  if (sides === 8) {
    // Diamond
    return <polygon points="32,4 60,32 32,60 4,32" fill={fillColor} stroke={strokeColor} strokeWidth="2.5" strokeLinejoin="round" />
  }
  if (sides === 10) {
    // Elongated diamond / kite
    return <polygon points="32,4 58,28 32,60 6,28" fill={fillColor} stroke={strokeColor} strokeWidth="2.5" strokeLinejoin="round" />
  }
  if (sides === 12) {
    // Pentagon
    const pts = Array.from({ length: 5 }, (_, i) => {
      const a = (i * 72 - 90) * Math.PI / 180
      return `${cx + 27 * Math.cos(a)},${cy + 27 * Math.sin(a)}`
    }).join(' ')
    return <polygon points={pts} fill={fillColor} stroke={strokeColor} strokeWidth="2.5" strokeLinejoin="round" />
  }
  if (sides === 20) {
    // Hexagon
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = (i * 60 - 30) * Math.PI / 180
      return `${cx + 27 * Math.cos(a)},${cy + 27 * Math.sin(a)}`
    }).join(' ')
    return <polygon points={pts} fill={fillColor} stroke={strokeColor} strokeWidth="2.5" strokeLinejoin="round" />
  }
  // d100: circle
  return <circle cx={cx} cy={cy} r="27" fill={fillColor} stroke={strokeColor} strokeWidth="2.5" />
}

// ─── d6 pip layout ────────────────────────────────────────────────────────────

const PIP_LAYOUTS = {
  1: [[32, 32]],
  2: [[20, 20], [44, 44]],
  3: [[20, 20], [32, 32], [44, 44]],
  4: [[20, 20], [44, 20], [20, 44], [44, 44]],
  5: [[20, 20], [44, 20], [32, 32], [20, 44], [44, 44]],
  6: [[20, 19], [44, 19], [20, 32], [44, 32], [20, 45], [44, 45]],
}

function D6Face({ value, color }) {
  const pips = PIP_LAYOUTS[value] || []
  return (
    <>
      {pips.map(([px, py], i) => (
        <circle key={i} cx={px} cy={py} r="4.5" fill={color} />
      ))}
    </>
  )
}

// ─── Single die visual ────────────────────────────────────────────────────────

function Die({ sides, value, rolling, isCrit, isFumble, size = 80 }) {
  const [displayValue, setDisplayValue] = useState(value)
  const [landed, setLanded] = useState(false)
  const intervalRef = useRef(null)
  const timeoutRef = useRef(null)

  const ROLL_DURATION = 680

  useEffect(() => {
    if (rolling) {
      setLanded(false)
      setDisplayValue(Math.floor(Math.random() * sides) + 1)
      intervalRef.current = setInterval(() => {
        setDisplayValue(Math.floor(Math.random() * sides) + 1)
      }, 55)
      timeoutRef.current = setTimeout(() => {
        clearInterval(intervalRef.current)
        setDisplayValue(value)
        setLanded(true)
      }, ROLL_DURATION)
    } else {
      clearInterval(intervalRef.current)
      clearTimeout(timeoutRef.current)
      setDisplayValue(value)
    }
    return () => {
      clearInterval(intervalRef.current)
      clearTimeout(timeoutRef.current)
    }
  }, [rolling, value, sides])

  const color = isCrit    ? '#facc15'
              : isFumble  ? '#ef4444'
              : 'var(--accent)'

  const animStyle = rolling
    ? { animation: `dice-tumble ${ROLL_DURATION}ms cubic-bezier(.36,.07,.19,.97) both` }
    : landed && isCrit
    ? { animation: 'dice-land 0.45s ease, dice-crit-glow 1.4s ease-in-out 0.45s infinite' }
    : landed && isFumble
    ? { animation: 'dice-land 0.45s ease, dice-fumble-shake 0.5s ease 0.45s' }
    : landed
    ? { animation: 'dice-land 0.45s ease' }
    : {}

  const vb = 64

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
      <div style={{ ...animStyle, width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg
          viewBox={`0 0 ${vb} ${vb}`}
          width={size}
          height={size}
          style={{ overflow: 'visible' }}
        >
          <DieShape sides={sides} filled color={color} />

          {/* Value display */}
          {sides === 6 ? (
            <D6Face value={displayValue} color={color} />
          ) : (
            <text
              x="32"
              y="36"
              textAnchor="middle"
              dominantBaseline="middle"
              fill={color}
              fontSize={sides === 100 ? 13 : sides === 4 ? 16 : 18}
              fontWeight="800"
              fontFamily="system-ui, sans-serif"
              style={{ userSelect: 'none' }}
            >
              {displayValue}
            </text>
          )}
        </svg>
      </div>
      <span style={{
        fontSize: 11, fontWeight: 700,
        color: isCrit ? '#facc15' : isFumble ? '#ef4444' : 'var(--text-muted)',
        letterSpacing: '.04em',
      }}>
        {isCrit ? '✦ CRIT!' : isFumble ? '✦ FUMBLE' : `d${sides}`}
      </span>
    </div>
  )
}

// ─── Die selector button ──────────────────────────────────────────────────────

function DiePicker({ sides, label, active, onClick }) {
  const [hovered, setHovered] = useState(false)
  const on = active || hovered
  const vb = 24

  const shape = () => {
    const fill = on ? 'color-mix(in srgb, var(--accent) 22%, transparent)' : 'color-mix(in srgb, var(--accent) 8%, transparent)'
    const stroke = 'var(--accent)'
    const sw = '1.8'
    if (sides === 4)   return <polygon points="12,2 22,20 2,20" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
    if (sides === 6)   return <rect x="2" y="2" width="20" height="20" rx="4" fill={fill} stroke={stroke} strokeWidth={sw} />
    if (sides === 8)   return <polygon points="12,2 22,12 12,22 2,12" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
    if (sides === 10)  return <polygon points="12,2 20,9 20,17 12,22 4,17 4,9" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
    if (sides === 12) {
      const pts = Array.from({ length: 5 }, (_, i) => {
        const a = (i * 72 - 90) * Math.PI / 180
        return `${12 + 10 * Math.cos(a)},${12 + 10 * Math.sin(a)}`
      }).join(' ')
      return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
    }
    if (sides === 20) {
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (i * 60 - 30) * Math.PI / 180
        return `${12 + 10 * Math.cos(a)},${12 + 10 * Math.sin(a)}`
      }).join(' ')
      return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
    }
    return <circle cx="12" cy="12" r="10" fill={fill} stroke={stroke} strokeWidth={sw} />
  }

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        padding: '10px 6px',
        borderRadius: 10,
        border: `1px solid ${on ? 'color-mix(in srgb, var(--accent) 55%, transparent)' : 'color-mix(in srgb, var(--border) 55%, transparent)'}`,
        background: on ? 'color-mix(in srgb, var(--accent) 10%, var(--bg-main))' : 'color-mix(in srgb, var(--bg-nav) 60%, transparent)',
        cursor: 'pointer',
        transition: 'all .12s ease',
        transform: hovered ? 'translateY(-2px)' : 'none',
      }}
    >
      <svg viewBox={`0 0 ${vb} ${vb}`} width="28" height="28" style={{ overflow: 'visible' }}>
        {shape()}
      </svg>
      <span style={{ fontSize: 11, fontWeight: 700, color: on ? 'var(--accent)' : 'var(--text-muted)' }}>{label}</span>
    </button>
  )
}

// ─── Modifier / advantage controls ───────────────────────────────────────────

function Controls({ count, setCount, modifier, setModifier, advantage, setAdvantage }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
      {[
        { label: 'Dice', content: (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <button onClick={() => setCount(c => Math.max(1, c - 1))} style={stepBtn}>{'−'}</button>
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-main)', minWidth: 24, textAlign: 'center' }}>{count}</span>
            <button onClick={() => setCount(c => Math.min(8, c + 1))} style={stepBtn}>+</button>
          </div>
        )},
        { label: 'Modifier', content: (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <button onClick={() => setModifier(m => m - 1)} style={stepBtn}>{'−'}</button>
            <span style={{ fontSize: 16, fontWeight: 800, color: modifier !== 0 ? 'var(--accent)' : 'var(--text-main)', minWidth: 28, textAlign: 'center' }}>{modifier >= 0 ? `+${modifier}` : modifier}</span>
            <button onClick={() => setModifier(m => m + 1)} style={stepBtn}>+</button>
          </div>
        )},
        { label: 'Mode', content: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {[['normal', 'Normal'], ['advantage', 'Adv'], ['disadvantage', 'Dis']].map(([val, lbl]) => (
              <button
                key={val}
                onClick={() => setAdvantage(val)}
                style={{
                  padding: '2px 6px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600,
                  background: advantage === val ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'transparent',
                  color: advantage === val ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >{lbl}</button>
            ))}
          </div>
        )},
      ].map(({ label, content }) => (
        <div key={label} style={{
          padding: '10px 8px', borderRadius: 10,
          border: '1px solid color-mix(in srgb, var(--border) 55%, transparent)',
          background: 'color-mix(in srgb, var(--bg-main) 60%, transparent)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.09em' }}>{label}</span>
          {content}
        </div>
      ))}
    </div>
  )
}

const stepBtn = {
  width: 22, height: 22, borderRadius: 5, border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
  background: 'var(--bg-nav)', color: 'var(--text-main)', fontSize: 14, fontWeight: 700,
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
}

// ─── History entry ────────────────────────────────────────────────────────────

function HistoryRow({ entry, first }) {
  const color = entry.isCrit ? '#facc15' : entry.isFumble ? '#ef4444' : 'var(--accent)'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 7,
      background: first ? 'color-mix(in srgb, var(--accent) 6%, var(--bg-main))' : 'transparent',
    }}>
      {/* Mini die icon */}
      <svg viewBox="0 0 16 16" width="14" height="14" style={{ flexShrink: 0 }}>
        <rect x="1" y="1" width="14" height="14" rx="3" fill="none" stroke={color} strokeWidth="1.5" />
        <circle cx="8" cy="8" r="2" fill={color} />
      </svg>
      <span style={{ flex: 1, fontSize: 11, color: first ? 'var(--text-main)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
        {entry.label}
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{entry.timestamp}</span>
    </div>
  )
}

// ─── Roll result total banner ─────────────────────────────────────────────────

function ResultBanner({ entry }) {
  if (!entry) return null
  const color = entry.isCrit ? '#facc15' : entry.isFumble ? '#ef4444' : 'var(--accent)'
  const bg = `color-mix(in srgb, ${color} 9%, var(--bg-main))`
  const border = `color-mix(in srgb, ${color} 35%, transparent)`

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
      padding: '10px 20px', borderRadius: 12, background: bg, border: `1px solid ${border}`,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 2 }}>Total</div>
        <div style={{ fontSize: 40, fontWeight: 900, color, lineHeight: 1 }}>{entry.total}</div>
      </div>
      {(entry.modifier !== 0 || entry.breakdown) && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 200 }}>{entry.label}</div>
      )}
    </div>
  )
}

// ─── Main DiceRoller ──────────────────────────────────────────────────────────

const DICE_TYPES = [
  { sides: 4, label: 'd4' },
  { sides: 6, label: 'd6' },
  { sides: 8, label: 'd8' },
  { sides: 10, label: 'd10' },
  { sides: 12, label: 'd12' },
  { sides: 20, label: 'd20' },
  { sides: 100, label: 'd%' },
]

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

export default function DiceRoller({ onClose }) {
  injectStyle()

  const [stageDice, setStageDice] = useState([])
  const [rolling, setRolling] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [history, setHistory] = useState([])
  const [count, setCount] = useState(1)
  const [modifier, setModifier] = useState(0)
  const [advantage, setAdvantage] = useState('normal')
  const rollTimeoutRef = useRef(null)

  const rollDie = (sides) => Math.floor(Math.random() * sides) + 1

  const handleRoll = useCallback((sides) => {
    if (rolling) return
    clearTimeout(rollTimeoutRef.current)

    // Roll all dice
    let rolls = Array.from({ length: count }, () => rollDie(sides))

    // Advantage / disadvantage on single d20
    let dropped = []
    if (advantage !== 'normal' && sides === 20 && count === 1) {
      const extra = rollDie(20)
      const kept = advantage === 'advantage' ? Math.max(rolls[0], extra) : Math.min(rolls[0], extra)
      dropped = [rolls[0] === kept ? extra : rolls[0]]
      rolls = [kept]
    }

    const sum = rolls.reduce((a, b) => a + b, 0)
    const total = sum + modifier

    const isCrit   = sides === 20 && rolls.includes(20)
    const isFumble = sides === 20 && rolls.includes(1) && !isCrit

    // Build stage dice
    const newDice = rolls.map((val, i) => ({
      id: uid(), sides, finalValue: val, rolling: true,
      isCrit: isCrit && i === 0, isFumble: isFumble && i === 0,
      stagger: i * 60,
    }))
    setStageDice(newDice)
    setRolling(true)
    setLastResult(null)

    // Build history entry
    const modStr = modifier !== 0 ? ` ${modifier >= 0 ? '+' : ''}${modifier}` : ''
    const dropStr = dropped.length ? ` [dropped: ${dropped.join(', ')}]` : ''
    const rollStr = rolls.join(', ')
    const label = `${count}d${sides}${modStr} → ${total} (${rollStr}${dropStr})`
    const entry = {
      id: uid(), sides, total, modifier, isCrit, isFumble, label,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    // After animation completes, reveal result
    rollTimeoutRef.current = setTimeout(() => {
      setStageDice(prev => prev.map(d => ({ ...d, rolling: false })))
      setRolling(false)
      setLastResult(entry)
      setHistory(prev => [entry, ...prev].slice(0, 40))
    }, 680 + (newDice.length - 1) * 60)
  }, [rolling, count, modifier, advantage])

  const clearStage = () => {
    if (!rolling) { setStageDice([]); setLastResult(null) }
  }

  const stageEmpty = stageDice.length === 0

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--bg-nav)',
        border: '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
        borderRadius: 20,
        width: 'min(520px, 100%)',
        maxHeight: 'calc(100vh - 48px)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 70px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="4"/>
              <circle cx="8" cy="8" r="1.5" fill="var(--accent)"/>
              <circle cx="16" cy="8" r="1.5" fill="var(--accent)"/>
              <circle cx="8" cy="16" r="1.5" fill="var(--accent)"/>
              <circle cx="16" cy="16" r="1.5" fill="var(--accent)"/>
            </svg>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>Dice Roller</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* ── Stage ── */}
          <div style={{
            minHeight: 180,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px 24px',
            background: 'color-mix(in srgb, var(--bg-main) 50%, transparent)',
            borderBottom: '1px solid color-mix(in srgb, var(--border) 40%, transparent)',
            position: 'relative',
            cursor: stageEmpty ? 'default' : 'pointer',
            flexShrink: 0,
          }} onClick={stageEmpty ? undefined : clearStage}>
            {stageEmpty ? (
              <div style={{ textAlign: 'center', opacity: 0.4 }}>
                <svg viewBox="0 0 64 64" width="52" height="52" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ display: 'block', margin: '0 auto 10px' }}>
                  <polygon points="32,4 60,32 32,60 4,32" strokeWidth="2" />
                  <polygon points="32,4 60,20 60,44 32,60 4,44 4,20" strokeWidth="2" />
                  <circle cx="32" cy="32" r="4" fill="var(--text-muted)" />
                </svg>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Click a die below to roll</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: '100%' }}>
                {/* Dice row */}
                <div style={{
                  display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap',
                  animation: 'die-appear 0.2s ease',
                }}>
                  {stageDice.map((die) => (
                    <Die
                      key={die.id}
                      sides={die.sides}
                      value={die.finalValue}
                      rolling={die.rolling}
                      isCrit={die.isCrit}
                      isFumble={die.isFumble}
                      size={stageDice.length > 4 ? 60 : stageDice.length > 2 ? 70 : 80}
                    />
                  ))}
                </div>
                {/* Total banner */}
                {lastResult && <ResultBanner entry={lastResult} />}
                {!rolling && stageDice.length > 0 && (
                  <p style={{ fontSize: 9, color: 'var(--text-muted)', margin: 0, letterSpacing: '.06em', textTransform: 'uppercase' }}>Click to clear</p>
                )}
              </div>
            )}
          </div>

          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* ── Controls ── */}
            <Controls
              count={count} setCount={setCount}
              modifier={modifier} setModifier={setModifier}
              advantage={advantage} setAdvantage={setAdvantage}
            />

            {/* ── Die buttons ── */}
            <div>
              <p style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>
                Roll a die
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                {DICE_TYPES.map(d => (
                  <DiePicker
                    key={d.sides}
                    sides={d.sides}
                    label={d.label}
                    active={false}
                    onClick={() => handleRoll(d.sides)}
                  />
                ))}
              </div>
            </div>

            {/* ── History ── */}
            {history.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <p style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em', margin: 0 }}>Roll History</p>
                  <button onClick={() => setHistory([])} style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Clear</button>
                </div>
                <div style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {history.map((entry, i) => (
                    <HistoryRow key={entry.id} entry={entry} first={i === 0} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
