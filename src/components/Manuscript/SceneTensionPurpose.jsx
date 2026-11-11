import { useFeatureFlag } from '../../utils/useFeatureFlag'
import {
  TENSION_LEVELS, SCENE_PURPOSES, MAX_PURPOSE_NOTE, getSceneTension, getScenePurpose,
  setTensionPatch, setPurposePatch, setPurposeNotePatch,
} from '../../utils/sceneTension'

// "Tension and purpose" for the open scene (roadmap B4): how tense the scene is (1 calm to 5 peak) and what it is
// for. Both are optional, written by the writer, and only used to draw the tension line in the Pacing chart;
// nothing is scored or advised. Hidden unless the `plot_threads` flag is on for the signed-in user.

export default function SceneTensionPurpose({ scene, onUpdateScene }) {
  const enabled = useFeatureFlag('plot_threads')
  if (!enabled || !scene) return null

  const tension = getSceneTension(scene)
  const purpose = getScenePurpose(scene)
  const apply = patch => { if (Object.keys(patch).length) onUpdateScene(scene.id, patch) }

  return (
    <div className="ms-insp-group ms-links" data-testid="scene-tension-purpose">
      <div className="ms-insp-label">Tension and purpose <em className="ms-links-beta">Beta</em></div>

      <div className="ms-links-group">
        <div className="ms-links-heading" id={`tension-label-${scene.id}`}>Tension</div>
        <div className="ms-tension-scale" role="group" aria-labelledby={`tension-label-${scene.id}`}>
          {TENSION_LEVELS.map(level => (
            <button
              key={level.value}
              type="button"
              aria-pressed={tension === level.value}
              aria-label={`Tension ${level.value}, ${level.label.toLowerCase()}`}
              onClick={() => apply(setTensionPatch(scene, tension === level.value ? null : level.value))}
            >
              <strong>{level.value}</strong>
              <span>{level.label}</span>
            </button>
          ))}
        </div>
        {tension !== null && <button type="button" className="ms-tension-clear" onClick={() => apply(setTensionPatch(scene, null))}>Clear tension</button>}
      </div>

      <label className="ms-insp-field">
        <span>What is this scene for?</span>
        <select value={purpose.key} onChange={event => apply(setPurposePatch(scene, event.target.value))}>
          <option value="">Not set</option>
          {SCENE_PURPOSES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label className="ms-insp-field">
        <span>Note on its purpose</span>
        <input
          value={purpose.note}
          maxLength={MAX_PURPOSE_NOTE}
          placeholder="e.g. Rowan learns the map lied"
          onChange={event => apply(setPurposeNotePatch(scene, event.target.value))}
        />
      </label>
    </div>
  )
}
