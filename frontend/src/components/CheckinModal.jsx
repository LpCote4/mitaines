import { useState } from 'react'
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

  const save = async (ctx) => {
    setSaving(true)
    await postCheckin(biting, ctx, 'manual')
    setSaving(false)
    onSave()
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
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
    </div>
  )
}
