import { useEffect } from 'react'
import confetti from 'canvas-confetti'

const MILESTONE_DATA = {
  first_clean_day: { icon: '🌱', title: 'Premier jour clean!', desc: 'Tu as passé une journée entière sans ronger. Le premier est le plus dur!' },
  streak_3: { icon: '🔥', title: '3 jours de suite!', desc: 'Trois jours consécutifs. La constance commence à s\'installer.' },
  streak_7: { icon: '⭐', title: 'Une semaine entière!', desc: 'Sept jours clean. Tu prouves que c\'est possible!' },
  streak_30: { icon: '🏆', title: 'Un mois complet!', desc: '30 jours — une habitude se brise, une nouvelle se forme.' },
  streak_90: { icon: '💻', title: 'Objectif laptop atteint!', desc: '90 jours de constance. Tu mérites ce laptop!' },
  first_urge_caught: { icon: '🛑', title: 'Première envie résistée!', desc: 'Tu as remarqué l\'envie AVANT de commencer. C\'est le vrai skill!' },
  urges_10: { icon: '💪', title: '10 envies résistées!', desc: 'La conscience de l\'envie devient un réflexe. Continue!' },
  urges_50: { icon: '🧤', title: '50 envies résistées!', desc: 'Cinquante fois tu as choisi de résister. Incroyable.' },
}

export default function MilestoneModal({ milestone, onClose }) {
  const data = MILESTONE_DATA[milestone?.key] || {
    icon: '🎉', title: milestone?.key, desc: ''
  }

  useEffect(() => {
    confetti({
      particleCount: 120,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#7c3aed', '#06b6d4', '#10b981', '#f59e0b'],
    })
  }, [])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal milestone-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="milestone-icon">{data.icon}</div>
        <h2>{data.title}</h2>
        <p>{data.desc}</p>
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={onClose}>
          Merci! 🙌
        </button>
      </div>
    </div>
  )
}
