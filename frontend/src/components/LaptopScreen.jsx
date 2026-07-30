import { useEffect, useState } from 'react'
import { getLaptops } from '../api'

const USD_TO_CAD = 1.38

function Badge({ ok, label, dimLabel }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: '0.72rem', padding: '3px 8px', borderRadius: 999,
      background: ok ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.12)',
      color: ok ? '#10b981' : 'var(--text-3, #64748b)',
      border: `1px solid ${ok ? 'rgba(16,185,129,0.35)' : 'rgba(148,163,184,0.2)'}`,
      whiteSpace: 'nowrap',
    }}>
      {ok ? '✓' : '·'} {ok ? label : (dimLabel ?? label)}
    </span>
  )
}

function BonusBadge({ on, label }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: '0.72rem', padding: '3px 8px', borderRadius: 999,
      background: on ? 'rgba(6,182,212,0.16)' : 'rgba(148,163,184,0.08)',
      color: on ? '#06b6d4' : 'var(--text-3, #64748b)',
      border: `1px solid ${on ? 'rgba(6,182,212,0.4)' : 'rgba(148,163,184,0.18)'}`,
      whiteSpace: 'nowrap', opacity: on ? 1 : 0.55,
    }}>
      {on ? '+' : '·'} {label}
    </span>
  )
}

function LaptopCard({ l }) {
  const c = l.criteria
  const cad = l.price_usd != null ? Math.round(l.price_usd * USD_TO_CAD) : null
  const border = c.meets_all ? 'rgba(16,185,129,0.6)'
    : c.meets_core ? 'rgba(124,58,237,0.5)' : 'var(--border)'

  return (
    <div className="card" style={{ marginBottom: 12, borderColor: border }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1.2 }}>{l.model}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{l.cpu}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>
            {l.price_usd != null ? `$${l.price_usd.toLocaleString()} US` : 'N/D'}
          </div>
          {cad != null && <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>≈ {cad.toLocaleString()} CAD</div>}
        </div>
      </div>

      {c.meets_all
        ? <div style={{ margin: '8px 0', color: '#10b981', fontWeight: 600, fontSize: '0.85rem' }}>✅ Répond aux critères durs</div>
        : c.meets_core
          ? <div style={{ margin: '8px 0', color: '#f59e0b', fontWeight: 600, fontSize: '0.85rem' }}>◆ Specs OK — manque: {[!c.no_touch && 'non-tactile', !c.nvidia_ok && 'GPU NVIDIA'].filter(Boolean).join(', ')}</div>
          : <div style={{ margin: '8px 0', color: 'var(--text-3)', fontWeight: 600, fontSize: '0.85rem' }}>✗ Ne remplit pas les critères durs</div>}

      {/* Critères durs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <Badge ok={c.ram_ok} label={`${l.ram_gb ?? '?'} Go RAM`} />
        <Badge ok={c.storage_ok} label={`${l.storage_gb ? (l.storage_gb / 1000 % 1 === 0 ? l.storage_gb / 1000 + ' To' : l.storage_gb + ' Go') : '?'}`} />
        <Badge ok={c.cpu_ok} label={`PassMark ${l.passmark?.toLocaleString() ?? '?'}`} />
        <Badge ok={c.price_ok} label={`< $3500`} dimLabel={`$${l.price_usd?.toLocaleString()}`} />
        <Badge ok={c.no_touch} label={'non-tactile'} dimLabel={'écran tactile'} />
        <Badge ok={c.nvidia_ok} label={`🎮 ${l.gpu}`} dimLabel={'pas de GPU NVIDIA'} />
      </div>

      {/* Bonus (pluses) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
        <BonusBadge on={c.low_power} label={`🔋 batterie (${l.tdp_w ?? '?'}W)`} />
        <BonusBadge on={c.build_ok} label={`◆ ${l.build || 'châssis'}`} />
      </div>

      {l.notes && <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', marginTop: 8 }}>{l.notes}</div>}
      {l.url && (
        <a href={l.url} target="_blank" rel="noreferrer"
          style={{ display: 'inline-block', marginTop: 8, fontSize: '0.82rem', color: '#06b6d4' }}>
          Voir l'offre →
        </a>
      )}
    </div>
  )
}

export default function LaptopScreen() {
  const [data, setData] = useState(null)

  useEffect(() => { getLaptops().then(setData) }, [])

  if (!data) return <div className="screen"><div className="loading">Chargement…</div></div>

  const laptops = data.laptops || []
  const matches = laptops.filter((l) => l.criteria.meets_all).length

  return (
    <div className="screen">
      <div className="home-header">
        <h1>💻 Laptop</h1>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>{laptops.length} modèles</span>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Tes critères</div>
        <div style={{ fontSize: '0.85rem', lineHeight: 1.7, color: 'var(--text-2)' }}>
          <strong>Durs:</strong> RAM ≥ 32 Go (soudée!) · ≥ 1 To · PassMark {'>'} 25 000 · {'<'} 3500 $US · <strong>non-tactile</strong> · <strong>GPU NVIDIA</strong><br />
          <span style={{ color: 'var(--text-3)' }}>Bonus (+): 🔋 batterie (TDP ≤28W) · ◆ châssis ★★★</span><br />
          <span style={{ color: 'var(--text-3)' }}>💾 SSD 1 To accepté — swappable vers 2 To pour ~$120 US (~$165 CAD)</span>
        </div>
        <div style={{ marginTop: 8, fontWeight: 600, color: matches ? '#10b981' : 'var(--text-2)' }}>
          {matches > 0 ? `✅ ${matches} modèle${matches > 1 ? 's' : ''} coche${matches > 1 ? 'nt' : ''} les critères durs` : 'Aucun modèle ne coche les critères durs'}
        </div>
      </div>

      {laptops.map((l) => <LaptopCard key={l.id} l={l} />)}

      {laptops.length === 0 && (
        <div style={{ color: 'var(--text-2)', fontSize: '0.9rem', textAlign: 'center', marginTop: 20 }}>
          Aucun modèle pour l'instant. Je vais en ajouter au fil de mes recherches.
        </div>
      )}
    </div>
  )
}
