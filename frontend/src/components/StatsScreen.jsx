import { useEffect, useState } from 'react'
import {
  ComposedChart, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Line, PieChart, Pie, Cell,
} from 'recharts'
import { getDailyStats, getHeatmap, getHourlyStats, getContextStats, getInsights, getSummary } from '../api'
import DayDetailModal from './DayDetailModal'

// ── Helpers ───────────────────────────────────────────────────────────────────

function heatColor(biting, tracked) {
  if (!tracked) return '#1a1a28'
  if (biting === 0) return '#10b981'
  if (biting === 1) return '#84cc16'
  if (biting === 2) return '#f59e0b'
  if (biting <= 4) return '#f97316'
  return '#ef4444'
}

const CONTEXT_COLORS = {
  coding: '#7c3aed',
  stress: '#ef4444',
  bored: '#f59e0b',
  other: '#94a3b8',
}

function addRollingAvg(data, key = 'biting', window = 7) {
  return data.map((item, i) => {
    const slice = data.slice(Math.max(0, i - window + 1), i + 1)
    const avg = slice.reduce((s, d) => s + (d[key] || 0), 0) / slice.length
    return { ...item, avg: Math.round(avg * 10) / 10 }
  })
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#1a1a28', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10, padding: '10px 14px', fontSize: '0.8rem',
    }}>
      <div style={{ marginBottom: 4, color: '#94a3b8' }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  )
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab() {
  const [summary, setSummary] = useState(null)
  const [insights, setInsights] = useState([])
  const [contextData, setContextData] = useState([])

  useEffect(() => {
    getSummary().then(setSummary)
    getInsights().then((d) => setInsights(d?.insights || []))
    getContextStats().then(setContextData)
  }, [])

  if (!summary) return <div className="loading">Chargement…</div>

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-head)', fontSize: '2rem', fontWeight: 800 }}>
            {summary.current_streak}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-2)' }}>streak actuel</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-head)', fontSize: '2rem', fontWeight: 800 }}>
            {summary.longest_streak}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-2)' }}>record personnel</div>
        </div>
      </div>

      {contextData.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title">Contextes (30 derniers jours)</div>
          <div style={{ display: 'flex', height: 160 }}>
            <ResponsiveContainer width="50%" height="100%">
              <PieChart>
                <Pie data={contextData} dataKey="count" cx="50%" cy="50%" outerRadius={60} innerRadius={30}>
                  {contextData.map((entry) => (
                    <Cell key={entry.context} fill={CONTEXT_COLORS[entry.context] || '#94a3b8'} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
              {contextData.map((d) => (
                <div key={d.context} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem' }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: CONTEXT_COLORS[d.context] || '#94a3b8', flexShrink: 0,
                  }} />
                  <span style={{ textTransform: 'capitalize' }}>{d.context}</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-2)' }}>{d.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {insights.length > 0 && (
        <div className="card">
          <div className="section-title">Insights</div>
          {insights.map((text, i) => (
            <div key={i} className="insight-item">
              <span className="insight-dot">💡</span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Timeline tab ──────────────────────────────────────────────────────────────

function TimelineTab({ onDayClick }) {
  const [daily, setDaily] = useState([])
  const [heatmap, setHeatmap] = useState([])

  useEffect(() => {
    getDailyStats().then((d) => setDaily(addRollingAvg(d)))
    getHeatmap().then(setHeatmap)
  }, [])

  if (!daily.length) return <div className="loading">Chargement…</div>

  const chartData = daily.map((d) => ({ ...d, name: d.date.slice(5) }))

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Rongements / jour (30j) + moyenne 7j</div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 10 }} interval={4} />
              <YAxis tick={{ fill: '#475569', fontSize: 10 }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="biting" fill="#ef4444" radius={[3, 3, 0, 0]} name="Rongements" />
              <Line type="monotone" dataKey="avg" stroke="#f59e0b" strokeWidth={2} dot={false} name="Moy. 7j" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 4, display: 'flex', gap: 12 }}>
          <span><span style={{ color: '#ef4444' }}>■</span> Rongements</span>
          <span><span style={{ color: '#f59e0b' }}>—</span> Moy. 7 jours</span>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Heatmap (35 derniers jours) — tap pour détail</div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 8, fontSize: '0.7rem', color: 'var(--text-3)' }}>
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center' }}>{d}</div>
          ))}
        </div>
        <div className="heatmap">
          {heatmap.map((cell) => (
            <div
              key={cell.date}
              className={`heatmap-cell ${cell.tracked && cell.total < 3 ? 'partial' : ''}`}
              style={{ background: heatColor(cell.biting, cell.tracked) }}
              title={`${cell.date}: ${cell.biting} rongements`}
              onClick={() => onDayClick(cell.date)}
            />
          ))}
        </div>
        <div className="heatmap-legend">
          <div className="heatmap-legend-swatch" style={{ background: '#1a1a28', border: '1px solid rgba(255,255,255,0.15)' }} />
          <span>Non tracé</span>
          <div className="heatmap-legend-swatch" style={{ background: '#10b981' }} />
          <span>Clean</span>
          <div className="heatmap-legend-swatch" style={{ background: '#f59e0b' }} />
          <span>2–3</span>
          <div className="heatmap-legend-swatch" style={{ background: '#ef4444' }} />
          <span>5+</span>
        </div>
      </div>
    </div>
  )
}

// ── Patterns tab ──────────────────────────────────────────────────────────────

function PatternsTab() {
  const [hourly, setHourly] = useState([])
  const [daily, setDaily] = useState([])

  useEffect(() => {
    getHourlyStats().then(setHourly)
    getDailyStats().then(setDaily)
  }, [])

  if (!hourly.length) return <div className="loading">Chargement…</div>

  const trackedDays = daily.filter((d) => d.pings_sent > 0)
  const goodCoverageDays = trackedDays.filter((d) => d.coverage !== null && d.coverage >= 0.6)
  const coveragePct = trackedDays.length > 0
    ? Math.round((goodCoverageDays.length / trackedDays.length) * 100)
    : 0

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Rongements par heure (30j)</div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={hourly} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="hour" tickFormatter={(h) => `${h}h`} tick={{ fill: '#475569', fontSize: 10 }} interval={2} />
              <YAxis tick={{ fill: '#475569', fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                content={<CustomTooltip />}
                formatter={(v, n) => [v, n === 'biting' ? 'Rongements' : n]}
              />
              <Bar dataKey="biting" fill="#7c3aed" radius={[3, 3, 0, 0]} name="biting" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Qualité des données</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: coveragePct >= 60 ? 'var(--success-dim)' : 'var(--warning-dim)',
            border: `3px solid ${coveragePct >= 60 ? 'var(--success)' : 'var(--warning)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem',
          }}>
            {coveragePct}%
          </div>
          <div>
            <div style={{ fontWeight: 600 }}>
              {coveragePct >= 60 ? 'Bonne couverture' : 'Couverture insuffisante'}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>
              {goodCoverageDays.length}/{trackedDays.length} jours avec ≥60% de réponses
            </div>
          </div>
        </div>
        {coveragePct < 60 && trackedDays.length > 5 && (
          <div style={{ background: 'var(--warning-dim)', borderRadius: 8, padding: '10px 12px', fontSize: '0.85rem', color: 'var(--warning)' }}>
            💡 Les stats sont moins fiables avec peu de réponses. Essaie de répondre à plus de pings!
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-title">Couverture journalière (30j)</div>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 8 }}>
          {daily.slice(-30).map((d) => {
            const cov = d.coverage
            const color = cov === null ? '#1a1a28' : cov >= 0.8 ? '#10b981' : cov >= 0.5 ? '#f59e0b' : '#ef4444'
            return (
              <div
                key={d.date}
                title={`${d.date}: ${cov !== null ? Math.round(cov * 100) + '%' : 'aucun ping'}`}
                style={{ width: 14, height: 14, borderRadius: 3, background: color, cursor: 'default' }}
              />
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: '0.75rem', color: 'var(--text-3)' }}>
          <span><span style={{ color: '#10b981' }}>■</span> 80%+</span>
          <span><span style={{ color: '#f59e0b' }}>■</span> 50%+</span>
          <span><span style={{ color: '#ef4444' }}>■</span> {'<50%'}</span>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function StatsScreen() {
  const [tab, setTab] = useState('overview')
  const [selectedDay, setSelectedDay] = useState(null)

  return (
    <div className="screen">
      <div className="stats-header">
        <h1>📊 Statistiques</h1>
      </div>

      <div className="tabs">
        {[['overview', "Vue d'ensemble"], ['timeline', 'Timeline'], ['patterns', 'Patterns']].map(([key, label]) => (
          <button
            key={key}
            className={`tab-btn ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="animate-in" key={tab}>
        {tab === 'overview' && <OverviewTab />}
        {tab === 'timeline' && <TimelineTab onDayClick={setSelectedDay} />}
        {tab === 'patterns' && <PatternsTab />}
      </div>

      {selectedDay && (
        <DayDetailModal date={selectedDay} onClose={() => setSelectedDay(null)} />
      )}
    </div>
  )
}
