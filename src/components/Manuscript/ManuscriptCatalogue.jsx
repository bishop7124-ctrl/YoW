import { useMemo, useState } from 'react'
import Modal from '../shared/Modal'

const countWords = value => value?.trim().match(/\S+/g)?.length || 0

function formatWhen(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function copyStats(copy) {
  const acts = copy?.acts?.length || 0
  const chapters = copy?.chapters?.length || 0
  const scenes = copy?.scenes?.length || 0
  const words = (copy?.scenes || []).reduce((total, scene) => total + countWords(scene.content), 0)
  return { acts, chapters, scenes, words }
}

export default function ManuscriptCatalogue({
  copies,
  labels,
  currentStats,
  onRetire,
  onRestore,
  onDownload,
  onClose,
}) {
  const [confirmRetire, setConfirmRetire] = useState(false)
  const [restoreCopy, setRestoreCopy] = useState(null)
  const [retireCurrentFirst, setRetireCurrentFirst] = useState(true)

  const sortedCopies = useMemo(
    () => [...(copies || [])].sort((a, b) => new Date(b.retiredAt || 0) - new Date(a.retiredAt || 0)),
    [copies]
  )

  const defaultTitle = () => `Retired manuscript ${new Date().toLocaleDateString()}`

  const submitRetire = () => {
    onRetire(defaultTitle())
    setConfirmRetire(false)
  }

  const submitRestore = () => {
    if (!restoreCopy) return
    onRestore(restoreCopy.id, {
      retireCurrentFirst,
      currentTitle: defaultTitle(),
    })
    setRestoreCopy(null)
  }

  return (
    <Modal title="Manuscript catalogue" onClose={onClose} wide>
      <div className="ms-catalogue">
        <section className="ms-catalogue-current">
          <div>
            <h3>Working manuscript</h3>
            <p>
              {currentStats.words.toLocaleString()} words / {currentStats.acts} {labels.level1.toLowerCase()}{currentStats.acts === 1 ? '' : 's'} / {currentStats.chapters} {labels.level2.toLowerCase()}{currentStats.chapters === 1 ? '' : 's'} / {currentStats.scenes} {labels.level3.toLowerCase()}{currentStats.scenes === 1 ? '' : 's'}
            </p>
          </div>
          <button type="button" className="ms-catalogue-primary" onClick={() => setConfirmRetire(true)}>
            Retire manuscript
          </button>
        </section>

        <p className="ms-catalogue-warning">
          Retiring saves the current manuscript and outline to this catalogue, then starts a fresh manuscript. The outline is retired with it. Both can be restored later.
        </p>

        {sortedCopies.length === 0 ? (
          <div className="ms-catalogue-empty">No retired manuscript copies yet.</div>
        ) : (
          <ul className="ms-catalogue-list">
            {sortedCopies.map(copy => {
              const stats = copyStats(copy)
              return (
                <li key={copy.id} className="ms-catalogue-item">
                  <div>
                    <strong>{copy.title || 'Retired manuscript'}</strong>
                    <span>{formatWhen(copy.retiredAt) || 'Saved copy'}</span>
                    <p>
                      {stats.words.toLocaleString()} words / {stats.acts} {labels.level1.toLowerCase()}{stats.acts === 1 ? '' : 's'} / {stats.chapters} {labels.level2.toLowerCase()}{stats.chapters === 1 ? '' : 's'} / {stats.scenes} {labels.level3.toLowerCase()}{stats.scenes === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="ms-catalogue-actions">
                    <button type="button" className="ms-catalogue-secondary" onClick={() => onDownload(copy)}>
                      Download
                    </button>
                    <button type="button" className="ms-catalogue-secondary" onClick={() => setRestoreCopy(copy)}>
                      Restore
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {confirmRetire && (
          <div className="ms-vh-confirm-overlay">
            <div className="ms-vh-confirm-box">
              <div className="ms-vh-confirm-title">Retire this manuscript?</div>
              <div className="ms-vh-confirm-body">
                Your current manuscript and outline will be saved to the catalogue, then replaced with a fresh starter manuscript.
              </div>
              <div className="ms-vh-confirm-actions">
                <button type="button" className="ms-tpl-confirm-cancel" onClick={() => setConfirmRetire(false)}>Cancel</button>
                <button type="button" className="ms-vh-restore-btn" onClick={submitRetire}>Retire and start fresh</button>
              </div>
            </div>
          </div>
        )}

        {restoreCopy && (
          <div className="ms-vh-confirm-overlay">
            <div className="ms-vh-confirm-box">
              <div className="ms-vh-confirm-title">Restore this manuscript?</div>
              <div className="ms-vh-confirm-body">
                Restoring overwrites the current manuscript and outline data.
              </div>
              <label className="ms-catalogue-checkbox">
                <input
                  type="checkbox"
                  checked={retireCurrentFirst}
                  onChange={event => setRetireCurrentFirst(event.target.checked)}
                />
                <span>Retire the current manuscript first</span>
              </label>
              <div className="ms-vh-confirm-actions">
                <button type="button" className="ms-tpl-confirm-cancel" onClick={() => setRestoreCopy(null)}>Cancel</button>
                <button type="button" className="ms-vh-restore-btn" onClick={submitRestore}>Restore copy</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
