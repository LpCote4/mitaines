import { useEffect, useState } from 'react'
import { getSummary, postCheckin, registerPush } from '../api'
import CheckinModal from './CheckinModal'
import EveningModal from './EveningModal'

const SIZE = 130
const STROKE = 10
const R = (SIZE - STROKE) / 2
const CIRC = 2 * Math.PI * R

function StreakRing({ streak, goal }) {
  const pct = Math.min(streak / goal, 1)
  const dash = pct * CIRC

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
        <div className="streak-days">{streak}</div>
        <div className="streak-label">jours</div>
      </div>
    </div>
  )
}

export default function HomeScreen() {
  const [summary, setSummary] = useState(null)
  const [checkinType, setCheckinType] = useState(null) // 'biting' | context needed
  const [showEvening, setShowEvening] = useState(false)
  const [pushState, setPushState] = useState('unknown') // 'unknown'|'denied'|'granted'|'default'
  const [feedbackMsg, setFeedbackMsg] = useState(null)

  const load = () => getSummary().then(setSummary)

  useEffect(() => {
    load()
    if ('Notification' in window) setPushState(Notification.permission)
  }, [])

  const showFeedback = (msg) => {
    setFeedbackMsg(msg)
    setTimeout(() => setFeedbackMsg(null), 2500)
  }

  const handleClean = async () => {
    await postCheckin(false, null, 'manual')
    showFeedback('✅ Logged — clean!')
    load()
  }

  const handleUrge = async () => {
    await postCheckin(false, null, 'urge')
    showFeedback('🛑 Bravo! Envie résistée enregistrée!')
    load()
  }

  const handleCheckinDone = () => {
    setCheckinType(null)
    load()
  }

  const handlePushEnable = async () => {
    const perm = await Notification.requestPermission()
    setPushState(perm)
    if (perm === 'granted') {
      await registerPush()
      showFeedback('🔔 Notifications activées!')
    }
  }

  const handleTestNotif = () => {
    if (Notification.permission !== 'granted') return
    const reg = navigator.serviceWorker.controller
    if (reg) {
      navigator.serviceWorker.ready.then((r) =>
        r.showNotification('🧤 Mitaines', {
          body: 'Est-ce que tu ronges là?',
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: 'mitaines-test',
          requireInteraction: true,
          actions: [
            { action: 'clean', title: '✅ Clean' },
            { action: 'biting', title: '😬 Je ronge' },
          ],
        })
      )
    } else {
      new Notification('🧤 Mitaines', { body: 'Est-ce que tu ronges là?', icon: '/icon-192.png' })
    }
  }

  const goal = summary?.laptop_goal_days || 90
  const streak = summary?.current_streak || 0

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

      {pushState === 'granted' && (
        <button
          onClick={handleTestNotif}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-2)',
            fontSize: '0.8rem',
            padding: '6px 12px',
            cursor: 'pointer',
            marginBottom: 8,
            alignSelf: 'flex-end',
          }}
        >
          🔔 Tester notif
        </button>
      )}

      {feedbackMsg && (
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px 16px',
          marginBottom: 12,
          textAlign: 'center',
          animation: 'fade-in 0.2s',
          fontSize: '0.95rem',
        }}>
          {feedbackMsg}
        </div>
      )}

      <div className="card streak-card" style={{ marginBottom: 16 }}>
        <StreakRing streak={streak} goal={goal} />
        <div className="streak-info">
          <h3>{streak} jour{streak !== 1 ? 's' : ''} clean</h3>
          <p>Objectif laptop: {goal} jours</p>
          <div className="laptop-progress">
            <div className="laptop-progress-bar" style={{ width: `${Math.min(streak / goal * 100, 100)}%` }} />
          </div>
          <div className="laptop-progress-label">
            {streak}/{goal} — {Math.round(streak / goal * 100)}%
          </div>
        </div>
      </div>

      <div className="actions">
        <button className="action-btn clean" onClick={handleClean}>
          <span className="icon">✅</span>
          <span>Clean là</span>
          <span className="action-btn-sub">Tap rapide</span>
        </button>
        <button className="action-btn biting" onClick={() => setCheckinType('biting')}>
          <span className="icon">😬</span>
          <span>Je ronge</span>
          <span className="action-btn-sub">Avec contexte</span>
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
            {summary ? `${summary.today_responses}/${summary.today_pings}` : '–'}
          </div>
          <div className="today-stat-label">pings répondus</div>
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
