import { useState } from 'react'
import { postEvening } from '../api'

const CONTEXTS = [
  { key: 'coding', label: '💻 Coding' },
  { key: 'stress', label: '😰 Stress' },
  { key: 'bored', label: '😑 Ennui' },
  { key: 'other', label: '🤷 Autre' },
]

const INTENSITY_COLORS = ['', '#10b981', '#84cc16', '#f59e0b', '#f97316', '#ef4444']
const INTENSITY_LABELS = ['', 'Rien 😊', 'Léger', 'Modéré', 'Intense', 'Très intense 😵']

export default function EveningModal({ onClose }) {
  const [intensity, setIntensity] = useState(0)
  const [context, setContext] = useState(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (intensity === 0) return
    setSaving(true)
    await postEvening(intensity, context, note || null)
    setSaving(false)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <h2>🌙 Bilan du soir</h2>

        <div className="section-title">Intensité aujourd'hui</div>
        <div className="intensity-track">
          {[1, 2, 3, 4, 5].map((v) => (
            <div
              key={v}
              className="intensity-pip"
              style={{
                background: v <= intensity ? INTENSITY_COLORS[v] : undefined,
                cursor: 'pointer',
              }}
              onClick={() => setIntensity(v)}
            />
          ))}
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: 16, minHeight: 20 }}>
          {intensity > 0 ? INTENSITY_LABELS[intensity] : 'Sélectionne l\'intensité'}
        </div>

        <div className="section-title">Contexte dominant</div>
        <div className="context-grid" style={{ marginBottom: 16 }}>
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

        <div className="section-title">Note (optionnel)</div>
        <textarea
          className="note-input"
          placeholder="Qu'est-ce qui s'est passé aujourd'hui?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <div className="btn-row">
          <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button
            className="btn btn-primary"
            onClick={save}
            disabled={saving || intensity === 0}
          >
            {saving ? '…' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>
  )
}
