import { supabase } from '../supabase'

// ── Findings (Plot Hole, Lore Conflict, Style Consistency) ────────────────────

export async function loadFindings(userId, projectId, toolType) {
  const { data, error } = await supabase
    .from('ai_findings')
    .select('*')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('tool_type', toolType)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function saveFinding(userId, projectId, toolType, finding) {
  const row = {
    user_id:     userId,
    project_id:  projectId,
    tool_type:   toolType,
    title:       finding.title,
    severity:    finding.severity || 'medium',
    status:      'unresolved',
    source_refs: finding.affectedRefs || finding.sourceRefs || [],
    evidence:    finding.evidence || {},
    suggestion:  finding.suggestion || '',
  }
  const { data, error } = await supabase.from('ai_findings').insert(row).select().single()
  if (error) throw error
  return data
}

export async function saveAllFindings(userId, projectId, toolType, findings) {
  if (!findings?.length) return []
  const rows = findings.map(f => ({
    user_id:     userId,
    project_id:  projectId,
    tool_type:   toolType,
    title:       f.title,
    severity:    f.severity || 'medium',
    status:      f.status   || 'unresolved',
    source_refs: f.affectedRefs || f.sourceRefs || [],
    // Pack all display fields into evidence so they survive the round-trip
    evidence: {
      location:    f.location    || '',
      explanation: f.explanation || '',
      example:     f.example     || '',
      baseline:    f.baseline    || '',
      sourceA:     f.sourceA     || '',
      sourceB:     f.sourceB     || '',
      evidenceA:   f.evidenceA   || '',
      evidenceB:   f.evidenceB   || '',
      ...(f.evidence || {}),
    },
    suggestion: f.suggestion || '',
  }))
  const { data, error } = await supabase.from('ai_findings').insert(rows).select()
  if (error) throw error
  return data || []
}

export async function updateFindingStatus(id, status) {
  const { error } = await supabase
    .from('ai_findings')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteFinding(id) {
  const { error } = await supabase.from('ai_findings').delete().eq('id', id)
  if (error) throw error
}

// Convert a raw DB row back to the shape the UI components expect.
export function rowToFinding(row) {
  const ev = row.evidence || {}
  return {
    // identity
    _id:          row.id,
    id:           row.id,
    status:       row.status || 'unresolved',
    severity:     row.severity || 'medium',
    title:        row.title,
    suggestion:   row.suggestion || '',
    affectedRefs: row.source_refs || [],
    createdAt:    row.created_at,
    // plot-hole / style fields stored flat in evidence
    location:     ev.location    || '',
    explanation:  ev.explanation || '',
    example:      ev.example     || '',
    baseline:     ev.baseline    || '',
    // lore-conflict evidence columns
    sourceA:      ev.sourceA     || '',
    sourceB:      ev.sourceB     || '',
    evidenceA:    ev.evidenceA   || '',
    evidenceB:    ev.evidenceB   || '',
  }
}

// ── Character Interviews ──────────────────────────────────────────────────────

export async function loadInterviews(userId, projectId) {
  const { data, error } = await supabase
    .from('character_interviews')
    .select('*')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createInterview(userId, projectId, characterId, mode) {
  const { data, error } = await supabase
    .from('character_interviews')
    .insert({ user_id: userId, project_id: projectId, character_id: characterId, mode, messages: [], saved_notes: [] })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateInterview(id, messages, savedNotes) {
  const { error } = await supabase
    .from('character_interviews')
    .update({ messages, saved_notes: savedNotes, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteInterview(id) {
  const { error } = await supabase.from('character_interviews').delete().eq('id', id)
  if (error) throw error
}
