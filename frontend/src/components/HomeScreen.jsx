import { useEffect, useState } from 'react'
import { getSummary, getEconomy, postCheckin, registerPush } from '../api'
import CheckinModal from './CheckinModal'
import EveningModal from './EveningModal'

const SIZE = 150
const STROKE = 12
const R = (SIZE - STROKE) / 2
const CIRC = 2 * Math.PI * R

function CagnotteRing({ remaining, goal }) {
  const progress = Math.max(0, Math.min((goal - remaining) / goal, 1))
  const dash = progress * CIRC

  return (
    <div className="streak-ring-wrap">
      <svg width={SIZE} height={SIZE}>
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          fill="none" stroke="rgba(255,255,255,0.06)"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          fill="none"
          stroke="url(#ring-grad)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${CIRC}`}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
        <defs>
          <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
      </svg>
      <div className="streak-ring-center">
        <div className="streak-days" style={{ fontSize: '1.6rem' }}>{remaining.toFixed(1)}</div>
        <div className="streak-label">jours restants</div>
      </div>
    </div>
  )
}

function minutesUntil(iso) {
  if (!iso) return 0
  const diff = new Date(iso).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / 60000))
}

export default function HomeScreen() {
  const [summary, setSummary] = useState(null)
  const [economy, setEconomy] = useState(null)
  const [checkinType, setCheckinType] = useState(null)
  const [showEvening, setShowEvening] = useState(false)
  const [pushState, setPushState] = useState('unknown')
  const [feedbackMsg, setFeedbackMsg] = useState(null)
  const [, setTick] = useState(0)

  const load = () => {
    getSummary().then(setSummary)
    getEconomy().then(setEconomy)
  }

  useEffect(() => {
    load()
    if ('Notification' in window) setPushState(Notification.permission)
    const t = setInterval(() => setTick((n) => n + 1), 20000) // refresh credit timer
    return () => clearInterval(t)
  }, [])

  const showFeedback = (msg) => {
    setFeedbackMsg(msg)
    setTimeout(() => setFeedbackMsg(null), 3000)
  }

  const applyEconResult = (res) => {
    const ec = res?.economy
    if (ec) setEconomy(ec)
    return ec
  }

  const handleClean = async () => {
    const ec = applyEconResult(await postCheckin(false, null, 'manual'))
    if (ec?.credited) showFeedback(`💰 +${ec.amount} jour banké!`)
    else if (ec?.reason === 'cooldown') showFeedback(`✅ Noté — déjà crédité cette heure`)
    else showFeedback('✅ Noté — clean!')
    getSummary().then(setSummary)
  }

  const handleUrge = async () => {
    const ec = applyEconResult(await postCheckin(false, null, 'urge'))
    if (ec?.credited) showFeedback(`🛑 Envie résistée! +${ec.amount} jour 💰`)
    else showFeedback('🛑 Bravo! Envie résistée!')
    getSummary().then(setSummary)
  }

  const handleCheckinDone = (res) => {
    const ec = applyEconResult(res)
    setCheckinType(null)
    if (ec?.penalized) showFeedback(`😬 Noté — +${ec.amount} jour au compteur`)
    getSummary().then(setSummary)
  }

  const handlePushEnable = async () => {
    const perm = await Notification.requestPermission()
    setPushState(perm)
    if (perm === 'granted') {
      await registerPush()
      showFeedback('🔔 Notifications activées!')
    }
  }

  const goal = economy?.goal_days || summary?.laptop_goal_days || 90
  const remaining = economy?.remaining_days ?? goal
  const cagnotte = economy?.cagnotte ?? 0
  const cagnotteTotal = economy?.cagnotte_total ?? 3000
  const streak = summary?.current_streak || 0
  const ev = economy?.active_event
  const creditReady = economy?.credit_ready
  const nextMin = minutesUntil(economy?.next_credit_at)

  return (
    <div className="screen">
      <div className="home-header">
        <h1>🧤 Mitaines</h1>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>
          {new Date().toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'short' })}
        </span>
      </div>

      {pushState === 'default' && (
        <div className="push-banner" onClick={handlePushEnable} role="button">
          <span style={{ fontSize: '1.5rem' }}>🔔</span>
          <div className="push-banner-text">
            <strong>Activer les notifications</strong>
            <span>Reçois des rappels aléatoires dans la journée</span>
          </div>
          <span style={{ color: 'var(--warning)' }}>›</span>
        </div>
      )}

      {ev && (
        <div style={{
          background: 'linear-gradient(90deg, rgba(124,58,237,0.25), rgba(6,182,212,0.25))',
          border: '1px solid rgba(124,58,237,0.5)',
          borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: '1.4rem' }}>✨</span>
          <div style={{ flex: 1 }}>
            <strong style={{ display: 'block' }}>{ev.label}</strong>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>
              Check-ins x{ev.multiplier} en ce moment!
            </span>
          </div>
        </div>
      )}

      {feedbackMsg && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 12,
          textAlign: 'center', animation: 'fade-in 0.2s', fontSize: '0.95rem',
        }}>
          {feedbackMsg}
        </div>
      )}

      {/* Cagnotte hero */}
      <div className="card streak-card" style={{ marginBottom: 16 }}>
        <CagnotteRing remaining={remaining} goal={goal} />
        <div className="streak-info">
          <div style={{ fontSize: '1.9rem', fontWeight: 700, lineHeight: 1.1 }}>
            ${cagnotte.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p style={{ marginTop: 2 }}>cagnotte laptop · objectif ${cagnotteTotal.toLocaleString()}</p>
          <div className="laptop-progress">
            <div className="laptop-progress-bar" style={{ width: `${(cagnotte / cagnotteTotal) * 100}%` }} />
          </div>
          <div className="laptop-progress-label">
            {remaining.toFixed(1)} jours pour le laptop
          </div>
        </div>
      </div>

      {/* Credit availability */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        marginBottom: 14, fontSize: '0.9rem',
        color: creditReady ? 'var(--urge, #10b981)' : 'var(--text-2)',
      }}>
        {creditReady
          ? <span>💰 Crédit dispo — un check-in clean rapporte +{economy?.credit_per_checkin ?? 0.1} jour</span>
          : <span>⏳ Prochain crédit dans {nextMin} min</span>}
      </div>

      <div className="actions">
        <button className="action-btn clean" onClick={handleClean}>
          <span className="icon">✅</span>
          <span>Clean là</span>
          <span className="action-btn-sub">{creditReady ? `+${economy?.credit_per_checkin ?? 0.1} 💰` : 'Tap rapide'}</span>
        </button>
        <button className="action-btn biting" onClick={() => setCheckinType('biting')}>
          <span className="icon">😬</span>
          <span>Je ronge</span>
          <span className="action-btn-sub">−{economy?.next_penalty_preview ?? '?'} j</span>
        </button>
        <button className="action-btn urge" onClick={handleUrge}>
          <span className="icon">🛑</span>
          <span>J'ai résisté!</span>
          <span className="action-btn-sub">Bravo!</span>
        </button>
      </div>

      <div className="today-summary">
        <div className="today-stat">
          <div className="today-stat-value" style={{ color: 'var(--danger)' }}>
            {summary?.today_biting ?? '–'}
          </div>
          <div className="today-stat-label">rongements</div>
        </div>
        <div className="today-stat">
          <div className="today-stat-value" style={{ color: 'var(--urge)' }}>
            {summary?.today_urges ?? '–'}
          </div>
          <div className="today-stat-label">résistances</div>
        </div>
        <div className="today-stat">
          <div className="today-stat-value" style={{ color: 'var(--text-2)' }}>
            {streak}
          </div>
          <div className="today-stat-label">jours clean</div>
        </div>
      </div>

      <button className="evening-btn" onClick={() => setShowEvening(true)}>
        🌙 Bilan du soir
      </button>

      {checkinType === 'biting' && (
        <CheckinModal
          title="😬 Je ronge"
          biting={true}
          onSave={handleCheckinDone}
          onClose={() => setCheckinType(null)}
        />
      )}

      {showEvening && (
        <EveningModal onClose={() => { setShowEvening(false); load() }} />
      )}
    </div>
  )
}
