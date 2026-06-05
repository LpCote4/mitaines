import { useState } from 'react'
import { verifyPin } from '../api'

export default function PinGate({ onAuth }) {
  const [digits, setDigits] = useState([])
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  const handleKey = async (key) => {
    if (checking) return
    setError('')

    if (key === 'del') {
      setDigits((d) => d.slice(0, -1))
      return
    }

    const next = [...digits, key]
    setDigits(next)

    if (next.length === 4) {
      setChecking(true)
      const ok = await verifyPin(next.join(''))
      if (ok) {
        onAuth()
      } else {
        setError('PIN incorrect')
        setDigits([])
      }
      setChecking(false)
    }
  }

  return (
    <div className="pin-gate">
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: 8 }}>🧤</div>
        <h1>Mitaines</h1>
        <p style={{ marginTop: 8, maxWidth: 240 }}>Entre ton PIN pour accéder à l'application</p>
      </div>

      <div className="pin-dots">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`pin-dot ${i < digits.length ? 'filled' : ''}`} />
        ))}
      </div>

      {error && <p className="pin-error">{error}</p>}

      <div className="pin-keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) => (
          <button
            key={i}
            className={`pin-key ${k === '' ? 'empty' : ''} ${k === 'del' ? 'delete' : ''}`}
            onClick={() => k && handleKey(k)}
            disabled={checking}
          >
            {k === 'del' ? '⌫' : k}
          </button>
        ))}
      </div>
    </div>
  )
}
