import { useId, useMemo, useState } from 'react'
import { useFeatureFlag } from '../../utils/useFeatureFlag'
import { MAX_ALIASES_PER_RECORD, buildClashIndex, clashesFromIndex, parseAliasText, recordAliases } from '../../utils/entityResolver'

// The warning lines on their own, for editors that already have their own alias input (characters keep their
// existing "Alias / Keywords" field). Shown only while the flag is on.
export function AliasClashNotes({ texts, data, self }) {
  const enabled = useFeatureFlag('connected_refs')
  // The index of every other record's names is built once per change to the project's lists (not per keystroke).
  const alsoKey = (self?.alsoIds || []).join('|')
  const index = useMemo(
    () => (enabled ? buildClashIndex(data, self) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, data?.characters, data?.locations, data?.factions, data?.loreEntries, data?.worldHistory, data?.timeline, self?.list, self?.id, alsoKey],
  )
  if (!enabled) return null
  return clashesFromIndex(index, texts).map(({ text, others }) => (
    <p key={text.toLowerCase()} role="status" className="text-xs text-[var(--warning,#b45309)]">
      “{text}” is also used by {others.map(o => `${o.name} (${o.sectionLabel.toLowerCase()})`).join(', ')}. The manuscript can link that name to only one of them.
    </p>
  ))
}

// "Other names" for a record (Release C, C1b): nicknames, titles or spellings the manuscript should recognise.
// Shown only while the `connected_refs` flag is on. Warns, never blocks, when a name or alias is already used by
// another record: the manuscript can link a name to only one record, so the writer should know.
//
// data: the project's { characters, locations, factions, loreEntries, worldHistory, timeline }
// self: { list, id } for the record being edited (omit id when creating)
export default function AliasesField({ value, onChange, ownName = '', data, self, disabled = false }) {
  const enabled = useFeatureFlag('connected_refs')
  const fieldId = useId()
  const [draft, setDraft] = useState('')
  if (!enabled) return null

  const aliases = Array.isArray(value) ? value : []
  const full = aliases.length >= MAX_ALIASES_PER_RECORD

  const commit = text => {
    const incoming = parseAliasText(text, ownName)
    if (!incoming.length) { setDraft(''); return }
    onChange(recordAliases({ name: ownName, aliases: [...aliases, ...incoming] }))
    setDraft('')
  }
  const onKeyDown = event => {
    if ((event.key === 'Enter' || event.key === ',') && draft.trim()) { event.preventDefault(); commit(draft) }
    else if (event.key === 'Backspace' && !draft && aliases.length && !disabled) onChange(aliases.slice(0, -1))
    else if (event.key === 'Enter') event.preventDefault() // never submit the record form from this field
  }

  return (
    <div className="space-y-2" data-testid="aliases-field">
      <label htmlFor={`${fieldId}-input`} className="block form-label mb-1.5">Other names</label>
      <div className="flex flex-wrap gap-1.5">
        {aliases.map(alias => (
          <span key={alias} className="inline-flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--bg-main)] px-2 py-0.5 text-sm">
            {alias}
            {!disabled && (
              <button type="button" className="text-[var(--text-muted)] hover:text-[var(--text-main)]" aria-label={`Remove other name ${alias}`}
                onClick={() => onChange(aliases.filter(item => item !== alias))}>×</button>
            )}
          </span>
        ))}
      </div>
      <input
        id={`${fieldId}-input`}
        className="field w-full px-3 py-2 text-base placeholder:text-[var(--text-muted)]"
        value={draft}
        disabled={disabled || full}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => { if (draft.trim()) commit(draft) }}
        placeholder={full ? `Up to ${MAX_ALIASES_PER_RECORD} other names` : 'e.g. a nickname or title. Press Enter to add'}
        aria-describedby={`${fieldId}-help`}
      />
      <p id={`${fieldId}-help`} className="text-xs text-[var(--text-muted)]">The manuscript recognises these as well as the name. Separate several with commas.</p>
      <AliasClashNotes texts={[ownName, ...aliases]} data={data} self={self} />
    </div>
  )
}
