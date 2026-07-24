import { useEffect, useState } from 'react'
import { getSettings, getEconomy, clearToken } from '../api'

export default function SettingsScreen() {
  const [settings, setSettings] = useState(null)
  const [economy, setEconomy] = useState(null)

  useEffect(() => {
    getSettings().then(setSettings)
    getEconomy().then(setEconomy)
  }, [])

  const handleLogout = () => {
    clearToken()
    window.location.reload()
  }

  return (
    <div className="screen">
      <div className="home-header">
        <h1>⚙️ Settings</h1>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Objectif</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SettingRow
            label="Objectif laptop"
            value={settings ? `${settings.laptop_goal_days} jours` : '…'}
          />
          <SettingRow
            label="Cagnotte"
            value={economy ? `$${economy.cagnotte} / $${economy.cagnotte_total}` : '…'}
          />
          <SettingRow
            label="Jours restants"
            value={economy ? `${economy.remaining_days.toFixed(1)} jours` : '…'}
          />
        </div>
      </div>

      <div className="card">
        <div className="section-title">Compte</div>
        <button
          className="btn btn-ghost"
          onClick={handleLogout}
          style={{ width: '100%', border: '1px solid var(--border)' }}
        >
          🔒 Verrouiller (déconnexion)
        </button>
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
