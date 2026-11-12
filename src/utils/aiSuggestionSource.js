// What an AI suggestion was written for, so it can only be applied where it still makes sense (audit AUD-21).
//
// A suggestion or rewrite is generated from one scene (and possibly one highlighted passage) at one moment. The
// writer may then open another scene, change the highlight, or keep typing. Applying the old text to the new
// situation would write one scene's prose into another, replace a different passage, or wipe newer edits.
// These helpers record the source at generation time and say, at apply time, whether it still matches. Nothing is
// ever changed here: a refused apply leaves the suggestion on screen so the writer can still copy it.

const text = value => (typeof value === 'string' ? value : '')

export function captureSource(scene, selectedText = '') {
  return {
    sceneId: scene?.id || '',
    sceneTitle: text(scene?.title).trim(),
    selection: text(selectedText).trim(),
    content: text(scene?.content),
  }
}

// mode: 'append' (insert at the end or cursor), 'replace' (the highlighted passage, or the whole scene when the
// suggestion was written for the whole scene). Returns { ok: true } or { ok: false, reason }.
export function checkApply(source, scene, selectedText = '', mode = 'append') {
  if (!source) return { ok: true }
  if (!scene?.id) return { ok: false, reason: 'Focus a scene to apply this.' }
  if (scene.id !== source.sceneId) {
    const name = source.sceneTitle ? `"${source.sceneTitle}"` : 'another scene'
    return { ok: false, reason: `This was written for ${name}. Open that scene to apply it, or copy the text.` }
  }
  if (mode === 'replace') {
    if (source.selection) {
      if (text(selectedText).trim() !== source.selection) {
        return { ok: false, reason: 'The highlighted text has changed since this was written. Highlight the same passage again, or copy the text.' }
      }
    } else if (text(scene.content) !== source.content) {
      return { ok: false, reason: 'This scene has been edited since the rewrite was written, so replacing it would remove those edits. Insert it instead, copy it, or generate it again.' }
    }
  }
  return { ok: true }
}
