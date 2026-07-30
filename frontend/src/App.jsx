import { useEffect, useState } from 'react'
import { getToken } from './api'
import PinGate from './components/PinGate'
import HomeScreen from './components/HomeScreen'
import StatsScreen from './components/StatsScreen'
import LaptopScreen from './components/LaptopScreen'
import SettingsScreen from './components/SettingsScreen'
import MilestoneModal from './components/MilestoneModal'
import { getMilestones, acknowledgeMilestone } from './api'

export default function App() {
  const [authed, setAuthed] = useState(false)
  const [screen, setScreen] = useState('home')
  const [pendingMilestones, setPendingMilestones] = useState([])

  useEffect(() => {
    if (getToken()) setAuthed(true)
  }, [])

  useEffect(() => {
    if (!authed) return
    getMilestones().then((data) => {
      if (data?.unshown?.length > 0) setPendingMilestones(data.unshown)
    })
  }, [authed])

  if (!authed) return <PinGate onAuth={() => setAuthed(true)} />

  const handleAckMilestone = async () => {
    const ms = pendingMilestones[0]
    if (ms) await acknowledgeMilestone(ms.key)
    setPendingMilestones((prev) => prev.slice(1))
  }

  return (
    <div className="app">
      <div className="orb orb-1" />
      <div className="orb orb-2" />

      {screen === 'home' && <HomeScreen />}
      {screen === 'stats' && <StatsScreen />}
      {screen === 'laptop' && <LaptopScreen />}
      {screen === 'settings' && <SettingsScreen />}

      <nav className="bottom-nav">
        <button className={`nav-btn ${screen === 'home' ? 'active' : ''}`} onClick={() => setScreen('home')}>
          <span>🏠</span>
          <span>Accueil</span>
        </button>
        <button className={`nav-btn ${screen === 'stats' ? 'active' : ''}`} onClick={() => setScreen('stats')}>
          <span>📊</span>
          <span>Stats</span>
        </button>
        <button className={`nav-btn ${screen === 'laptop' ? 'active' : ''}`} onClick={() => setScreen('laptop')}>
          <span>💻</span>
          <span>Laptop</span>
        </button>
        <button className={`nav-btn ${screen === 'settings' ? 'active' : ''}`} onClick={() => setScreen('settings')}>
          <span>⚙️</span>
          <span>Settings</span>
        </button>
      </nav>

      {pendingMilestones.length > 0 && (
        <MilestoneModal milestone={pendingMilestones[0]} onClose={handleAckMilestone} />
      )}
    </div>
  )
}
