import { useMemo, useState } from 'react'
import { buildOutlineModel } from '../../utils/outlineDisplay.js'
import { buildThreadGrid, threadAppearances, threadKindLabel, THREAD_ROLE_LABELS } from '../../utils/plotThreads'
import { navigateToFindingRef } from '../../utils/aiFindingNav'

// The Threads grid (roadmap B2): one row per plot thread, one column per chapter (or scene) in manuscript order,
// each cell showing how that thread appears there. Clicking a cell opens the scene. Wide screens get the grid;
// narrow screens get the same information as a list per thread. Read-only: threads are edited in the list.

const ROLE_LETTER = { setup: 'S', development: 'D', payoff: 'P', mention: 'M' }
const ROLE_ORDER = ['setup', 'development', 'payoff', 'mention']

export default function ThreadsGrid({ store }) {
  const { plotThreads = [], acts = [], chapters = [], scenes = [] } = store
  const [by, setBy] = useState('chapter')
  const outline = useMemo(() => buildOutlineModel({ acts, chapters, scenes }), [acts, chapters, scenes])
  const grid = useMemo(() => buildThreadGrid({ threads: plotThreads, outline, scenes, by }), [plotThreads, outline, scenes, by])
  const unit = by === 'scene' ? 'scene' : 'chapter'
  const open = sceneId => navigateToFindingRef(store, { type: 'scene', id: sceneId })

  if (!grid.columns.length) {
    return <p className="thr-note">Add chapters and scenes in the Outline to see where each thread runs.</p>
  }

  return (
    <div className="thr-grid-block" data-testid="threads-grid">
      <div className="thr-grid-controls">
        <div className="thr-seg" role="group" aria-label="Grid columns">
          <button type="button" aria-pressed={by === 'chapter'} className={by === 'chapter' ? 'is-active' : ''} onClick={() => setBy('chapter')}>By chapter</button>
          <button type="button" aria-pressed={by === 'scene'} className={by === 'scene' ? 'is-active' : ''} onClick={() => setBy('scene')}>By scene</button>
        </div>
        <ul className="thr-legend" aria-label="Key">
          {ROLE_ORDER.map(role => <li key={role}><span className={`thr-cell-sample is-${role}`}>{ROLE_LETTER[role]}</span>{THREAD_ROLE_LABELS[role]}</li>)}
        </ul>
      </div>

      <div className="thr-grid-scroll">
        <table className="thr-grid">
          <thead>
            <tr>
              <th scope="col" rowSpan={2} className="thr-grid-corner">Thread</th>
              {grid.groups.map(group => <th key={group.id} scope="colgroup" colSpan={group.span} className="thr-grid-act" title={group.label}>{group.label}</th>)}
            </tr>
            <tr>
              {grid.columns.map((column, index) => (
                <th key={column.id} scope="col" className="thr-grid-col" title={column.label}>
                  <span aria-hidden="true">{index + 1}</span>
                  <span className="thr-sr">{column.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map(row => (
              <tr key={row.thread.id}>
                <th scope="row" className="thr-grid-row">
                  <span className="thr-dot" style={row.thread.color ? { background: row.thread.color } : undefined} aria-hidden="true" />
                  <span className="thr-grid-name">{row.thread.name}</span>
                  <span className="thr-grid-kind">{threadKindLabel(row.thread)}</span>
                </th>
                {row.cells.map((cell, index) => (
                  <td key={cell.columnId} className="thr-grid-cell">
                    {cell.count > 0 && (
                      <button
                        type="button"
                        className={`thr-cell is-${cell.role}`}
                        style={row.thread.color ? { '--thr-color': row.thread.color } : undefined}
                        aria-label={`${row.thread.name}, ${grid.columns[index].label}: ${THREAD_ROLE_LABELS[cell.role].toLowerCase()}${cell.count > 1 ? ` (${cell.count} scenes)` : ''}. Open scene`}
                        title={`${THREAD_ROLE_LABELS[cell.role]}${cell.count > 1 ? ` · ${cell.count} scenes` : ''}`}
                        onClick={() => open(cell.hits[0].sceneId)}
                      >
                        {ROLE_LETTER[cell.role]}{cell.count > 1 ? <sup>{cell.count}</sup> : null}
                      </button>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="thr-appear" aria-label="Where each thread appears">
        {grid.rows.map(row => {
          const appearances = threadAppearances(row, grid.columns)
          return (
            <div key={row.thread.id} className="thr-appear-row">
              <div className="thr-appear-name"><span className="thr-dot" style={row.thread.color ? { background: row.thread.color } : undefined} aria-hidden="true" />{row.thread.name}</div>
              {appearances.length === 0
                ? <p className="thr-note">Not attached to any {unit} yet.</p>
                : <ul>{appearances.map(item => (
                  <li key={`${item.label}-${item.sceneId}`}>
                    <button type="button" className="thr-link" onClick={() => open(item.sceneId)}>{item.label}</button>
                    <span> — {THREAD_ROLE_LABELS[item.role].toLowerCase()}{item.count > 1 ? ` (${item.count} scenes)` : ''}</span>
                  </li>
                ))}</ul>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
