import { useEffect, useRef, useState } from 'react'
import { getSettings, updateSettings, pingNow } from '../api'

export default function SettingsScreen() {
  const [settings, setSettings] = useState(null)
  const [pingsPerDay, setPingsPerDay] = useState(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [pingCountdown, setPingCountdown] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s)
      setPingsPerDay(s.pings_per_day)
    })
  }, [])

  const showFeedback = (msg) => {
    setFeedback(msg)
    setTimeout(() => setFeedback(null), 2500)
  }

  const handleSliderChange = (value) => {
    setPingsPerDay(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSaving(true)
      try {
        await updateSettings({ pings_per_day: value })
        setSettings((prev) => ({ ...prev, pings_per_day: value }))
        showFeedback('✅ Sauvegardé! Pings re-schedulés pour aujourd\'hui.')
      } catch {
        showFeedback('❌ Erreur lors de la sauvegarde.')
      } finally {
        setSaving(false)
      }
    }, 600)
  }

  const handlePingNow = async () => {
    if (pingCountdown !== null) return
    const result = await pingNow()
    const delay = result?.delay_seconds
    if (!delay) return
    setPingCountdown(delay)
    const interval = setInterval(() => {
      setPingCountdown((prev) => {
        if (prev <= 1) { clearInterval(interval); return null }
        return prev - 1
      })
    }, 1000)
  }

  return (
    <div className="screen">
      <div className="home-header">
        <h1>⚙️ Settings</h1>
      </div>

      {feedback && (
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px 16px',
          marginBottom: 12,
          textAlign: 'center',
          animation: 'fade-in 0.2s',
          fontSize: '0.9rem',
        }}>
          {feedback}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Notifications</div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '0.95rem' }}>Pings par jour</span>
            <span style={{
              fontFamily: 'var(--font-head)',
              fontSize: '1.4rem',
              fontWeight: 800,
              color: 'var(--primary-light)',
            }}>
              {pingsPerDay ?? '…'}
            </span>
          </div>

          <input
            type="range"
            min={1}
            max={20}
            value={pingsPerDay ?? 5}
            onChange={(e) => handleSliderChange(Number(e.target.value))}
            disabled={settings === null}
            style={{ width: '100%', accentColor: 'var(--primary)' }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 4 }}>
            <span>1</span>
            <span>20</span>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginTop: 8 }}>
            Les pings sont distribués aléatoirement entre 9h et 21h, avec plus de poids sur les heures où tu ronges habituellement.
            {saving && <span style={{ color: 'var(--primary-light)', marginLeft: 6 }}>Sauvegarde…</span>}
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Test</div>
        <button
          className="btn btn-ghost"
          onClick={handlePingNow}
          style={{
            width: '100%',
            border: pingCountdown !== null ? '1px solid rgba(16,185,129,0.3)' : '1px solid var(--border)',
            pointerEvents: pingCountdown !== null ? 'none' : 'auto',
            background: pingCountdown !== null ? 'var(--success-dim)' : 'var(--surface)',
            color: pingCountdown !== null ? 'var(--success)' : 'var(--text)',
          }}
        >
          {pingCountdown !== null ? `⏱ Ping dans ${pingCountdown}s… (15 min pour répondre)` : '🧤 Envoyer un ping'}
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Infos système</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SettingRow
            label="Push configuré"
            value={settings?.push_configured ? '✅ Oui' : '❌ Non'}
            valueColor={settings?.push_configured ? 'var(--success)' : 'var(--danger)'}
          />
          <SettingRow
            label="Objectif laptop"
            value={settings ? `${settings.laptop_goal_days} jours` : '…'}
          />
          <SettingRow
            label="Pings par jour (défaut env)"
            value={settings ? String(settings.pings_per_day_default) : '…'}
          />
        </div>
      </div>
    </div>
  )
}

function SettingRow({ label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>{label}</span>
      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: valueColor || 'var(--text)' }}>{value}</span>
    </div>
  )
}
