import { useEffect, useState } from 'react'
import { getDayDetail } from '../api'

function formatTime(ts) {
  try {
    // ts is UTC ISO, convert to local
    const d = new Date(ts + 'Z')
    return d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ts?.slice(11, 16) || '?'
  }
}

const CONTEXT_LABELS = { coding: '💻 Coding', stress: '😰 Stress', bored: '😑 Ennui', other: '🤷 Autre' }
const INTENSITY_LABELS = ['', 'Léger', 'Léger', 'Modéré', 'Intense', 'Très intense']

export default function DayDetailModal({ date, onClose }) {
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    getDayDetail(date).then(setDetail)
  }, [date])

  const label = new Date(date + 'T12:00:00').toLocaleDateString('fr-CA', {
    weekday: 'long', day: 'numeric', month: 'long'
  })

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxHeight: '85vh' }}>
        <div className="modal-handle" />
        <h2 style={{ textTransform: 'capitalize' }}>{label}</h2>

        {!detail ? (
          <div className="loading">Chargement…</div>
        ) : (
          <>
            <div className="section-title">Check-ins ({detail.checkins.length})</div>
            {detail.checkins.length === 0 ? (
              <p style={{ color: 'var(--text-3)', fontSize: '0.9rem' }}>Aucun check-in ce jour-là.</p>
            ) : (
              <div className="day-detail-list">
                {detail.checkins.map((c) => (
                  <div key={c.id} className="checkin-row">
                    <span className="checkin-time">{formatTime(c.timestamp)}</span>
                    {c.type === 'urge' ? (
                      <span className="checkin-badge badge-urge">🛑 Résisté</span>
                    ) : c.biting ? (
                      <span className="checkin-badge badge-biting">😬 Rongé</span>
                    ) : (
                      <span className="checkin-badge badge-clean">✅ Clean</span>
                    )}
                    {c.context && (
                      <span className="checkin-ctx">{CONTEXT_LABELS[c.context] || c.context}</span>
                    )}
                    {c.type === 'ping_response' && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginLeft: 'auto' }}>ping</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {detail.evening && (
              <>
                <div className="section-title" style={{ marginTop: 16 }}>Bilan du soir</div>
                <div className="card" style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>Intensité: </span>
                      <strong>{INTENSITY_LABELS[detail.evening.intensity]}</strong>
                    </div>
                    {detail.evening.context && (
                      <div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>Contexte: </span>
                        <strong>{CONTEXT_LABELS[detail.evening.context] || detail.evening.context}</strong>
                      </div>
                    )}
                  </div>
                  {detail.evening.note && (
                    <p style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--text-2)' }}>
                      {detail.evening.note}
                    </p>
                  )}
                </div>
              </>
            )}

            <div style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--text-3)' }}>
              {detail.pings.length} ping{detail.pings.length !== 1 ? 's' : ''} envoyé{detail.pings.length !== 1 ? 's' : ''} ce jour-là
            </div>
          </>
        )}

        <div className="btn-row" style={{ marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Fermer</button>
        </div>
      </div>
    </div>
  )
}
