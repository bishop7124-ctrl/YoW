import { useMemo, useState } from 'react'
import { PROVIDERS } from '../../utils/aiApi'
import { DEFAULT_AI_SETTINGS } from '../../utils/aiSettings'
import { getProjectType } from '../../constants/projectTypes'
import {
  AI_CHAT_CONTEXT_MODES,
  CUSTOM_SELECTION_FIELDS,
  buildAIContext,
  getActiveContextTargets,
  getHistoryContextEntries,
  normalizeAiContextMode,
  orderedChapters,
  readCustomSelection,
  saveAiContextMode,
} from '../../utils/aiContext'
import { formatCompactTokens, formatCost } from './aiFormat'

const FIELD_LABEL = 'block text-xs text-[var(--text-muted)] uppercase tracking-widest mb-2'
const SELECT_CLASS = 'w-full bg-[var(--bg-main)] border border-[var(--border)] rounded px-2 py-1.5 text-base text-[var(--text-main)] outline-none focus:border-[var(--accent)]'

function ContextModeCard({ option, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`text-left rounded-lg border px-3 py-2 transition-colors ${
        selected
          ? 'border-[var(--accent)] bg-[var(--accent-fade)]'
          : 'border-[var(--border)] bg-[var(--bg-nav)] hover:border-[var(--accent)]/50'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-bold ${selected ? 'text-[var(--accent)]' : 'text-[var(--text-main)]'}`}>
          <span aria-hidden="true">{option.icon}</span> {option.label}
        </span>
        {option.badge && (
          <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--accent)] border border-[var(--accent)]/30 rounded px-1.5 py-0.5">
            {option.badge}
          </span>
        )}
      </div>
      <div className="text-[11px] text-[var(--text-muted)] mt-1 leading-snug">{option.helper}</div>
    </button>
  )
}

function ContextLevelBadge({ level }) {
  const cfg = {
    low: { dot: '🟢', label: 'Low context' },
    moderate: { dot: '🟡', label: 'Moderate context' },
    high: { dot: '🟠', label: 'High context' },
    very_high: { dot: '🔴', label: 'Very high context' },
  }[level?.level || level] || { dot: '🟢', label: 'Low context' }
  return <span className="text-[11px] text-[var(--text-muted)]">{cfg.dot} {cfg.label}</span>
}

function CheckRow({ label, sub, checked, onChange }) {
  return (
    <label className="flex items-start gap-2 cursor-pointer group py-0.5">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-[var(--accent)] flex-shrink-0 mt-1" />
      <span className="text-sm text-[var(--text-main)] group-hover:text-[var(--accent)] transition-colors leading-tight min-w-0">
        {label}
        {sub && <span className="block text-[11px] text-[var(--text-muted)]">{sub}</span>}
      </span>
    </label>
  )
}

// One collapsible category of the record checklist. `groups` is
// [{ label?, items: [{ id, label, sub }] }] so chapters can sit under their act.
function RecordGroup({ title, groups, selectedIds, onToggle, onSetMany, search }) {
  const all = groups.flatMap(group => group.items)
  const query = search.trim().toLowerCase()
  const visibleGroups = groups
    .map(group => ({ ...group, items: query ? group.items.filter(item => `${item.label} ${item.sub || ''}`.toLowerCase().includes(query)) : group.items }))
    .filter(group => group.items.length > 0)
  const selectedCount = all.filter(item => selectedIds.includes(item.id)).length
  if (all.length === 0) return null
  if (query && visibleGroups.length === 0) return null

  return (
    <details className="border border-[var(--border)] rounded-lg overflow-hidden" open={!!query || selectedCount > 0 || undefined}>
      <summary className="flex justify-between items-center px-3 py-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-main)] bg-[var(--bg-main)] cursor-pointer">
        <span>{title}</span>
        <span className={selectedCount ? 'text-[var(--accent)]' : ''}>{selectedCount} / {all.length}</span>
      </summary>
      <div className="p-3 bg-[var(--bg-nav)]">
        <div className="flex gap-3 mb-2">
          <button type="button" onClick={() => onSetMany(all.map(item => item.id), true)} className="text-[11px] text-[var(--accent)] hover:underline">Select all</button>
          <button type="button" onClick={() => onSetMany(all.map(item => item.id), false)} className="text-[11px] text-[var(--text-muted)] hover:underline">Clear</button>
        </div>
        {visibleGroups.map((group, index) => (
          <div key={group.label || index}>
            {group.label && <div className="text-[10px] text-[var(--accent)] uppercase tracking-wider mb-1 mt-2">{group.label}</div>}
            {group.items.map(item => (
              <CheckRow key={item.id} label={item.label} sub={item.sub} checked={selectedIds.includes(item.id)} onChange={() => onToggle(item.id)} />
            ))}
          </div>
        ))}
      </div>
    </details>
  )
}

const approxTokens = chars => Math.ceil(chars / 4)
const chapterLabel = (chapter, index, unit) => chapter.title || `${unit} ${index + 1}`

/**
 * Shared by the new-chat screen and the in-chat "Context" dialog. `value` is
 * the chat session's `context` object: { mode, customInstruction, chapterId,
 * characterId, characterIds, locationIds, loreEntryIds, worldHistoryIds,
 * chapterIds, ideaEntryIds }. Every edit goes out through `onChange(nextValue)`.
 */
export default function AiContextPicker({ store, novelId, aiSettings, value, onChange }) {
  const [search, setSearch] = useState('')
  const mode = normalizeAiContextMode(value?.mode)
  const selection = readCustomSelection(value)
  const safeSettings = aiSettings || DEFAULT_AI_SETTINGS
  const provider = safeSettings.activeProvider || DEFAULT_AI_SETTINGS.activeProvider
  const model = safeSettings[provider]?.model || PROVIDERS[provider]?.defaultModel
  const projectId = novelId || store.activeNovelId || store.activeNovel?.id

  const data = useMemo(() => store.getProjectContextData?.(projectId) ?? store, [store, projectId])
  const novel = data.activeNovel || store.activeNovel
  const unit = getProjectType(novel?.type).structure?.level2 || 'Chapter'
  const groupUnit = getProjectType(novel?.type).structure?.level1 || 'Act'
  const active = useMemo(() => getActiveContextTargets(store, projectId), [store, projectId])

  const chapters = useMemo(() => orderedChapters(data), [data])
  const chapterOptions = useMemo(() => {
    const acts = [...(data.acts || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    const groups = acts.map(act => ({ act, items: [] }))
    const orphans = []
    chapters.forEach((chapter, index) => {
      const entry = { id: chapter.id, label: chapterLabel(chapter, index, unit), chars: (data.scenes || []).filter(scene => scene.chapterId === chapter.id).reduce((sum, scene) => sum + String(scene.content || '').length, 0) }
      const group = groups.find(item => item.act.id === chapter.actId)
      if (group) group.items.push(entry)
      else orphans.push(entry)
    })
    return [
      ...groups.filter(group => group.items.length).map(group => ({ label: group.act.title || groupUnit, items: group.items })),
      ...(orphans.length ? [{ label: '', items: orphans }] : []),
    ]
  }, [data, chapters, unit, groupUnit])

  const characters = useMemo(() => [...(data.characters || [])].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))), [data])
  const history = useMemo(() => getHistoryContextEntries(data), [data])

  const preview = useMemo(() => buildAIContext({
    projectId,
    mode,
    userPrompt: '',
    activeCharacterId: value?.characterId || undefined,
    activeChapterId: value?.chapterId || undefined,
    selection: value,
    provider,
    model,
    store,
    customInstruction: value?.customInstruction,
  }), [store, projectId, mode, value, provider, model])

  const set = patch => onChange({ ...value, ...patch, mode })
  const selectMode = nextMode => {
    const normalized = normalizeAiContextMode(nextMode)
    saveAiContextMode(normalized)
    onChange({ ...value, mode: normalized })
  }
  const toggle = (field, id) => {
    const current = selection[field]
    set({ [field]: current.includes(id) ? current.filter(item => item !== id) : [...current, id] })
  }
  const setMany = (field, ids, on) => {
    const current = selection[field]
    set({ [field]: on ? [...new Set([...current, ...ids])] : current.filter(id => !ids.includes(id)) })
  }

  const activeChapter = chapters.find(chapter => chapter.id === active.chapterId)
  const activeCharacter = characters.find(character => character.id === active.characterId)
  const selectedTotal = CUSTOM_SELECTION_FIELDS.reduce((sum, field) => sum + selection[field].length, 0)
  const availableTotal = characters.length + (data.locations || []).length + (data.loreEntries || []).length + history.length + chapters.length + (data.ideaEntries || []).length
  const overBudget = preview.limitsKnown && preview.safeInputBudget && preview.truncated

  return (
    <div className="space-y-3">
      <div>
        <label className={FIELD_LABEL}>Context</label>
        <div className="grid gap-2">
          {AI_CHAT_CONTEXT_MODES.map(option => (
            <ContextModeCard key={option.id} option={option} selected={mode === option.id} onSelect={() => selectMode(option.id)} />
          ))}
        </div>
      </div>

      {mode === 'current_chapter' && (
        <div>
          <label className={FIELD_LABEL} htmlFor="ai-context-chapter">Which {unit.toLowerCase()}?</label>
          <select id="ai-context-chapter" className={SELECT_CLASS} value={value?.chapterId || ''} onChange={event => set({ chapterId: event.target.value || null })}>
            <option value="">Follow the editor{activeChapter ? ` (now: ${chapterLabel(activeChapter, chapters.indexOf(activeChapter), unit)})` : ` (no ${unit.toLowerCase()} open)`}</option>
            {chapterOptions.map((group, index) => (
              <optgroup key={group.label || index} label={group.label || `Other ${unit.toLowerCase()}s`}>
                {group.items.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
      )}

      {mode === 'current_character' && (
        <div>
          <label className={FIELD_LABEL} htmlFor="ai-context-character">Which character?</label>
          <select id="ai-context-character" className={SELECT_CLASS} value={value?.characterId || ''} onChange={event => set({ characterId: event.target.value || null })}>
            <option value="">Follow the open character{activeCharacter ? ` (now: ${activeCharacter.name || 'Unnamed'})` : ' (none open)'}</option>
            {characters.map(character => <option key={character.id} value={character.id}>{character.name || 'Unnamed'}</option>)}
          </select>
        </div>
      )}

      {mode === 'custom' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-nav)] px-3 py-2">
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-main)]">Records</div>
              <div className="text-[11px] text-[var(--text-muted)]">{selectedTotal} of {availableTotal} selected. Chosen records are sent in full.</div>
            </div>
            {selectedTotal > 0 && (
              <button
                type="button"
                onClick={() => onChange({ ...value, mode, ...Object.fromEntries(CUSTOM_SELECTION_FIELDS.map(field => [field, []])) })}
                className="flex-shrink-0 rounded border border-[var(--border)] px-2.5 py-1 text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
          {availableTotal > 12 && (
            <input
              type="search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Filter records…"
              aria-label="Filter records"
              className={SELECT_CLASS}
            />
          )}
          <RecordGroup
            title="Characters" search={search} selectedIds={selection.characterIds}
            groups={[{ items: characters.map(c => ({ id: c.id, label: c.name || 'Unnamed', sub: c.role })) }]}
            onToggle={id => toggle('characterIds', id)} onSetMany={(ids, on) => setMany('characterIds', ids, on)}
          />
          <RecordGroup
            title="Locations" search={search} selectedIds={selection.locationIds}
            groups={[{ items: (data.locations || []).map(l => ({ id: l.id, label: l.name || 'Unnamed', sub: l.category })) }]}
            onToggle={id => toggle('locationIds', id)} onSetMany={(ids, on) => setMany('locationIds', ids, on)}
          />
          <RecordGroup
            title="Lore" search={search} selectedIds={selection.loreEntryIds}
            groups={Object.entries((data.loreEntries || []).reduce((map, entry) => {
              const key = entry.category || 'Uncategorized'
              ;(map[key] ||= []).push({ id: entry.id, label: entry.title || 'Untitled' })
              return map
            }, {})).map(([label, items]) => ({ label, items }))}
            onToggle={id => toggle('loreEntryIds', id)} onSetMany={(ids, on) => setMany('loreEntryIds', ids, on)}
          />
          <RecordGroup
            title="History & timeline" search={search} selectedIds={selection.worldHistoryIds}
            groups={[{ items: history.map(h => ({ id: h.id, label: h.title || 'Untitled', sub: [h.date, h.era, h.dateRange].filter(Boolean).join(' / ') })) }]}
            onToggle={id => toggle('worldHistoryIds', id)} onSetMany={(ids, on) => setMany('worldHistoryIds', ids, on)}
          />
          <RecordGroup
            title="Notes & ideas" search={search} selectedIds={selection.ideaEntryIds}
            groups={[{ items: (data.ideaEntries || []).map(i => ({ id: i.id, label: i.title || '(untitled)', sub: i.group })) }]}
            onToggle={id => toggle('ideaEntryIds', id)} onSetMany={(ids, on) => setMany('ideaEntryIds', ids, on)}
          />
          <RecordGroup
            title={`${unit}s (full text)`} search={search} selectedIds={selection.chapterIds}
            groups={chapterOptions.map(group => ({
              label: group.label,
              items: group.items.map(item => ({ id: item.id, label: item.label, sub: item.chars ? `~${formatCompactTokens(approxTokens(item.chars))} tokens` : 'No text yet' })),
            }))}
            onToggle={id => toggle('chapterIds', id)} onSetMany={(ids, on) => setMany('chapterIds', ids, on)}
          />
        </div>
      )}

      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-main)] px-3 py-2" data-testid="ai-context-estimate">
        <div className="text-xs font-bold text-[var(--text-main)]">
          Estimated context: ~{formatCompactTokens(preview.estimatedTokens)} tokens
          {preview.limitsKnown && preview.contextWindow ? (
            <span className="text-[var(--text-muted)] font-semibold"> / {formatCompactTokens(preview.contextWindow)}</span>
          ) : null}
        </div>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <ContextLevelBadge level={preview.contextLevel} />
          {preview.estimatedInputCost && <span className="text-[11px] text-[var(--text-muted)]">Estimated input: {formatCost(preview.estimatedInputCost)}</span>}
        </div>
        {mode === 'smart' && (
          <p className="mt-1 text-[11px] text-[var(--text-muted)] leading-snug">Smart Context picks records for each message you send, so this is only the starting size.</p>
        )}
        {mode === 'custom' && selectedTotal === 0 && (
          <p className="mt-1 text-[11px] text-amber-400 leading-snug">Nothing is selected yet, so the AI only gets the project title and premise.</p>
        )}
        {mode !== 'custom' && preview.includedSources.labels.length > 0 && (
          <details className="mt-2">
            <summary className="text-[11px] font-bold text-[var(--accent)] cursor-pointer">Context included ({preview.includedSources.labels.length})</summary>
            <ul className="mt-1 space-y-0.5 text-[11px] text-[var(--text-muted)] max-h-40 overflow-y-auto">
              {preview.includedSources.labels.map(label => <li key={label}>- {label}</li>)}
            </ul>
          </details>
        )}
        {preview.warnings.length > 0 && (
          <div className="mt-1 space-y-1">
            {preview.warnings.map(warning => (
              <p key={warning} className={`text-[11px] leading-snug ${overBudget ? 'text-red-400' : 'text-amber-400'}`}>{warning}</p>
            ))}
          </div>
        )}
      </div>

      <details open={!!value?.customInstruction} className="border border-[var(--border)] rounded-lg overflow-hidden">
        <summary className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-main)] bg-[var(--bg-main)] cursor-pointer">Custom instruction</summary>
        <div className="p-3 bg-[var(--bg-nav)]">
          <textarea
            value={value?.customInstruction || ''}
            onChange={event => set({ customInstruction: event.target.value })}
            placeholder="Tell the AI anything extra — tone, style, what you're working on…"
            rows={4}
            className="w-full bg-[var(--bg-main)] border border-[var(--border)] rounded px-2 py-1.5 text-base text-[var(--text-main)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] resize-none"
          />
        </div>
      </details>
    </div>
  )
}
