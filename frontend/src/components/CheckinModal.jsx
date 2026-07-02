import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { postCheckin } from '../api'

const CONTEXTS = [
  { key: 'coding', label: '💻 Coding' },
  { key: 'stress', label: '😰 Stress' },
  { key: 'bored', label: '😑 Ennui' },
  { key: 'other', label: '🤷 Autre' },
]

export default function CheckinModal({ title, biting, onSave, onClose }) {
  const [context, setContext] = useState(null)
  const [saving, setSaving] = useState(false)
  const touchStartY = useRef(null)

  const save = async (ctx) => {
    setSaving(true)
    await postCheckin(biting, ctx, 'manual')
    setSaving(false)
    onSave()
  }

  const handleTouchStart = (e) => {
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchMove = (e) => {
    if (touchStartY.current === null) return
    if (e.touches[0].clientY - touchStartY.current > 80) {
      touchStartY.current = null
      onClose()
    }
  }

  return createPortal(
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div
          className="modal-top"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
        >
          <div className="modal-handle" />
          <button className="modal-close-btn" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <h2>{title}</h2>
        <p style={{ color: 'var(--text-2)', marginBottom: 16, fontSize: '0.9rem' }}>
          Dans quel contexte?
        </p>
        <div className="context-grid">
          {CONTEXTS.map((c) => (
            <button
              key={c.key}
              className={`ctx-btn ${context === c.key ? 'selected' : ''}`}
              onClick={() => setContext(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button
            className="btn btn-primary"
            onClick={() => save(context)}
            disabled={saving}
          >
            {saving ? '…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
