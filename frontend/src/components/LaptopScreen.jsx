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
        ? <div style={{ margin: '8px 0', color: '#10b981', fontWeight: 600, fontSize: '0.85rem' }}>✅ Répond à tous les critères</div>
        : c.meets_core
          ? <div style={{ margin: '8px 0', color: '#a78bfa', fontWeight: 600, fontSize: '0.85rem' }}>◆ Critères cœur OK — manque {!c.low_power && 'TDP bas'}{(!c.low_power && !c.build_ok) ? ' + ' : ''}{!c.build_ok && 'châssis'}</div>
          : <div style={{ margin: '8px 0', color: 'var(--text-3)', fontWeight: 600, fontSize: '0.85rem' }}>✗ Ne remplit pas tout</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <Badge ok={c.ram_ok} label={`${l.ram_gb ?? '?'} Go RAM`} />
        <Badge ok={c.storage_ok} label={`${l.storage_gb ? (l.storage_gb / 1000 % 1 === 0 ? l.storage_gb / 1000 + ' To' : l.storage_gb + ' Go') : '?'}`} />
        <Badge ok={c.cpu_ok} label={`PassMark ${l.passmark?.toLocaleString() ?? '?'}`} />
        <Badge ok={c.price_ok} label={`< $3500`} dimLabel={`$${l.price_usd?.toLocaleString()}`} />
        <Badge ok={c.low_power} label={`${l.tdp_w ?? '?'}W batterie`} dimLabel={l.tdp_w ? `${l.tdp_w}W` : 'TDP ?'} />
        <Badge ok={c.build_ok} label={l.build || 'châssis'} dimLabel={l.build || 'châssis ?'} />
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
          RAM ≥ 32 Go · Stockage ≥ 1 To · PassMark {'>'} 25 000 · Prix {'<'} 3500 $US<br />
          <span style={{ color: 'var(--text-3)' }}>Bonus: TDP bas (≤28W, batterie) · châssis CNC/premium</span>
        </div>
        <div style={{ marginTop: 8, fontWeight: 600, color: matches ? '#10b981' : 'var(--text-2)' }}>
          {matches > 0 ? `✅ ${matches} modèle${matches > 1 ? 's' : ''} répond${matches > 1 ? 'ent' : ''} à tout` : 'Aucun modèle ne coche encore 100% (surtout le châssis CNC)'}
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
