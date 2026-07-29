import { useEffect, useState } from 'react'
import {
  ComposedChart, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Line, PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts'
import {
  getDailyStats, getHeatmap, getHourlyStats, getContextStats, getInsights,
  getSummary, getEconomy, getLedger,
} from '../api'
import DayDetailModal from './DayDetailModal'

const GOAL_DAYS = 90
const CAGNOTTE_TOTAL = 3000
const DAY_VALUE = CAGNOTTE_TOTAL / GOAL_DAYS // ≈ $33.33 per day

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

const CONTEXT_LABELS = {
  coding: '💻 Coding', stress: '😰 Stress', bored: '😑 Ennui', other: '🤷 Autre',
}

const WEEKDAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

function addRollingAvg(data, key = 'biting', window = 7) {
  return data.map((item, i) => {
    const slice = data.slice(Math.max(0, i - window + 1), i + 1)
    const avg = slice.reduce((s, d) => s + (d[key] || 0), 0) / slice.length
    return { ...item, avg: Math.round(avg * 10) / 10 }
  })
}

function fmtMoney(v) {
  return '$' + (v || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Rebuild the cagnotte curve over time by replaying the ledger (asc).
function buildCagnotteSeries(ledger) {
  const asc = [...ledger].sort((a, b) => a.ts.localeCompare(b.ts))
  let remaining = GOAL_DAYS
  const series = [{ label: 'Départ', cagnotte: 0, jours: 0 }]
  for (const row of asc) {
    remaining = Math.max(0, Math.min(GOAL_DAYS, remaining + row.delta))
    const cagnotte = Math.round(CAGNOTTE_TOTAL * ((GOAL_DAYS - remaining) / GOAL_DAYS) * 100) / 100
    const d = new Date(row.ts.endsWith('Z') ? row.ts : row.ts + 'Z')
    series.push({
      label: d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }) +
        ' ' + d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }),
      cagnotte,
      jours: Math.round((GOAL_DAYS - remaining) * 10) / 10, // jours accumulés (90 - restants)
      remaining: Math.round(remaining * 10) / 10,
    })
  }
  return series
}

function projectFinish(ledger, remaining) {
  const asc = [...ledger].sort((a, b) => a.ts.localeCompare(b.ts))
  if (asc.length < 2) return null
  const firstTs = new Date(asc[0].ts.endsWith('Z') ? asc[0].ts : asc[0].ts + 'Z').getTime()
  const elapsedDays = (Date.now() - firstTs) / 86400000
  const earned = GOAL_DAYS - remaining // days of progress banked
  if (elapsedDays < 0.5 || earned <= 0.05) return null
  const rate = earned / elapsedDays // progress-days per real day
  const daysLeft = remaining / rate
  if (!isFinite(daysLeft) || daysLeft > 3650) return null
  const eta = new Date(Date.now() + daysLeft * 86400000)
  return { eta, rate, daysLeft: Math.round(daysLeft) }
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
          {p.name}: {p.dataKey === 'cagnotte' ? fmtMoney(p.value) : p.dataKey === 'jours' ? p.value + ' j' : p.value}
        </div>
      ))}
    </div>
  )
}

function StatCard({ value, label, color }) {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.8rem', fontWeight: 800, color }}>
        {value}
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-2)' }}>{label}</div>
    </div>
  )
}

// ── Progression tab (économie) ─────────────────────────────────────────────────

function ProgressionTab() {
  const [economy, setEconomy] = useState(null)
  const [ledger, setLedger] = useState([])
  const [unit, setUnit] = useState('money') // 'money' | 'days'

  useEffect(() => {
    getEconomy().then(setEconomy)
    getLedger(500).then((d) => setLedger(d || []))
  }, [])

  if (!economy) return <div className="loading">Chargement…</div>

  const series = buildCagnotteSeries(ledger)
  const proj = projectFinish(ledger, economy.remaining_days)

  // This week: earned vs lost
  const weekAgo = Date.now() - 7 * 86400000
  let earnedDays = 0, lostDays = 0
  for (const r of ledger) {
    const t = new Date(r.ts.endsWith('Z') ? r.ts : r.ts + 'Z').getTime()
    if (t < weekAgo) continue
    if (r.delta < 0) earnedDays += -r.delta
    else lostDays += r.delta
  }
  const earned$ = earnedDays * DAY_VALUE
  const lost$ = lostDays * DAY_VALUE
  const net$ = earned$ - lost$

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <StatCard value={fmtMoney(economy.cagnotte)} label={`cagnotte / ${fmtMoney(CAGNOTTE_TOTAL)}`} color="#10b981" />
        <StatCard value={economy.remaining_days.toFixed(1)} label="jours au laptop" />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>
            {unit === 'money' ? 'La cagnotte dans le temps' : '📈 Jours accumulés dans le temps'}
          </div>
          <div style={{ display: 'flex', gap: 2, background: 'var(--surface, #1a1a28)', borderRadius: 8, padding: 2 }}>
            {[['money', '$'], ['days', 'jours']].map(([key, lbl]) => (
              <button
                key={key}
                onClick={() => setUnit(key)}
                style={{
                  border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: '0.78rem',
                  cursor: 'pointer', fontWeight: 600,
                  background: unit === key ? '#10b981' : 'transparent',
                  color: unit === key ? '#04120c' : 'var(--text-2)',
                }}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={series} margin={{ top: 4, right: 6, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="cag-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 9 }} interval="preserveEnd" minTickGap={40} />
              <YAxis tick={{ fill: '#475569', fontSize: 10 }} width={44}
                tickFormatter={(v) => (unit === 'money' ? '$' + v : v + 'j')} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey={unit === 'money' ? 'cagnotte' : 'jours'}
                stroke="#10b981" strokeWidth={2} fill="url(#cag-grad)"
                name={unit === 'money' ? 'Cagnotte' : 'Jours accumulés'} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {series.length <= 2 && (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: 4 }}>
            Continue à logger — la courbe se remplit à chaque check-in. 📈
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">🎯 Projection laptop</div>
        {proj ? (
          <div>
            <div style={{ fontFamily: 'var(--font-head)', fontSize: '1.3rem', fontWeight: 800 }}>
              ~{proj.eta.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-2)', marginTop: 2 }}>
              dans ~{proj.daysLeft} jours, à ton rythme actuel ({(proj.rate * DAY_VALUE).toFixed(0)} $/jour)
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>
            Encore un peu de données et je te donne une date projetée. Continue à logger! 💪
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-title">Cette semaine</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, textAlign: 'center' }}>
          <div>
            <div style={{ fontWeight: 800, color: '#10b981', fontSize: '1.2rem' }}>+{fmtMoney(earned$)}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-2)' }}>gagné</div>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#ef4444', fontSize: '1.2rem' }}>−{fmtMoney(lost$)}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-2)' }}>perdu (rongements)</div>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: net$ >= 0 ? '#10b981' : '#ef4444', fontSize: '1.2rem' }}>
              {net$ >= 0 ? '+' : '−'}{fmtMoney(Math.abs(net$))}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-2)' }}>net</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Habitudes tab (comportement) ───────────────────────────────────────────────

function HabitudesTab({ onDayClick }) {
  const [hourly, setHourly] = useState([])
  const [context, setContext] = useState([])
  const [daily, setDaily] = useState([])
  const [heatmap, setHeatmap] = useState([])

  useEffect(() => {
    getHourlyStats().then(setHourly)
    getContextStats().then(setContext)
    getDailyStats().then((d) => setDaily(d || []))
    getHeatmap().then(setHeatmap)
  }, [])

  if (!daily.length && !hourly.length) return <div className="loading">Chargement…</div>

  // Danger zone
  const worstHour = hourly.reduce((a, b) => (b.biting > (a?.biting || 0) ? b : a), null)
  const worstContext = context[0] // already sorted desc

  // Check-ins vs rongements per day
  const cvr = daily.map((d) => ({
    name: d.date.slice(5),
    'Check-ins': d.clean || 0,
    Rongements: d.biting || 0,
  }))

  // By weekday (biting)
  const wd = Array(7).fill(0)
  for (const d of daily) {
    const day = new Date(d.date + 'T12:00:00').getDay()
    wd[day] += d.biting || 0
  }
  const weekdayData = [1, 2, 3, 4, 5, 6, 0].map((i) => ({ name: WEEKDAYS[i], biting: wd[i] }))

  // Trend this week vs last
  const sum = (arr) => arr.reduce((s, d) => s + (d.biting || 0), 0)
  const thisWeek = sum(daily.slice(-7))
  const lastWeek = sum(daily.slice(-14, -7))
  const trend = lastWeek === 0 ? null : (thisWeek - lastWeek) / lastWeek

  return (
    <div>
      {(worstHour || worstContext) && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'rgba(239,68,68,0.3)' }}>
          <div className="section-title">⚠️ Zone de danger</div>
          <div style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
            {worstHour && worstHour.biting > 0 && (
              <div>Heure la plus risquée: <strong>{worstHour.hour}h–{worstHour.hour + 1}h</strong></div>
            )}
            {worstContext && (
              <div>Contexte dominant: <strong>{CONTEXT_LABELS[worstContext.context] || worstContext.context}</strong> ({worstContext.pct}%)</div>
            )}
            {(!worstHour || worstHour.biting === 0) && !worstContext && (
              <div style={{ color: 'var(--text-2)' }}>Pas encore de pattern — logge quelques rongements avec contexte.</div>
            )}
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Check-ins vs rongements (30j)</div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={cvr} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 10 }} interval={4} />
              <YAxis tick={{ fill: '#475569', fontSize: 10 }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="Check-ins" fill="#10b981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Rongements" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 4, display: 'flex', gap: 12 }}>
          <span><span style={{ color: '#10b981' }}>■</span> Check-ins clean</span>
          <span><span style={{ color: '#ef4444' }}>■</span> Rongements</span>
        </div>
      </div>

      {trend !== null && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title">Tendance</div>
          <div style={{ fontSize: '0.9rem' }}>
            {trend < -0.1 ? `📉 ${Math.round(-trend * 100)}% de rongements en moins vs la semaine dernière — solide!`
              : trend > 0.1 ? `📈 ${Math.round(trend * 100)}% de plus que la semaine dernière — on se ressaisit.`
                : '➡️ Stable vs la semaine dernière.'}
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Rongements par heure</div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={hourly} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="hour" tickFormatter={(h) => `${h}h`} tick={{ fill: '#475569', fontSize: 10 }} interval={2} />
              <YAxis tick={{ fill: '#475569', fontSize: 10 }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} formatter={(v) => [v, 'Rongements']} />
              <Bar dataKey="biting" fill="#7c3aed" radius={[3, 3, 0, 0]} name="Rongements" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Par jour de la semaine</div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={weekdayData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 10 }} />
              <YAxis tick={{ fill: '#475569', fontSize: 10 }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} formatter={(v) => [v, 'Rongements']} />
              <Bar dataKey="biting" fill="#f59e0b" radius={[3, 3, 0, 0]} name="Rongements" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {heatmap.length > 0 && (
        <div className="card">
          <div className="section-title">Heatmap (35j) — tap pour détail</div>
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
        </div>
      )}
    </div>
  )
}

// ── Constance tab (engagement) ─────────────────────────────────────────────────

function ConstanceTab() {
  const [daily, setDaily] = useState([])
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    getDailyStats().then((d) => setDaily(d || []))
    getSummary().then(setSummary)
  }, [])

  if (!daily.length) return <div className="loading">Chargement…</div>

  const last14 = daily.slice(-14)
  const daysLogged = daily.filter((d) => d.total > 0).length
  const avgCheckins = daily.length
    ? Math.round((daily.reduce((s, d) => s + (d.total || 0), 0) / Math.max(daysLogged, 1)) * 10) / 10
    : 0

  const cData = last14.map((d) => ({ name: d.date.slice(5), checkins: d.total || 0 }))

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <StatCard value={avgCheckins} label="check-ins / jour actif" color="#06b6d4" />
        <StatCard value={summary?.longest_streak ?? '–'} label="plus longue série clean" />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Check-ins par jour (14j)</div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={cData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 10 }} interval={2} />
              <YAxis tick={{ fill: '#475569', fontSize: 10 }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} formatter={(v) => [v, 'Check-ins']} />
              <Bar dataKey="checkins" fill="#06b6d4" radius={[3, 3, 0, 0]} name="Check-ins" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: 4 }}>
          Gagner le laptop = se pointer. Chaque check-in compte. 💪
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function StatsScreen() {
  const [tab, setTab] = useState('progression')
  const [selectedDay, setSelectedDay] = useState(null)

  return (
    <div className="screen">
      <div className="stats-header">
        <h1>📊 Statistiques</h1>
      </div>

      <div className="tabs">
        {[['progression', 'Progression'], ['habitudes', 'Habitudes'], ['constance', 'Constance']].map(([key, label]) => (
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
        {tab === 'progression' && <ProgressionTab />}
        {tab === 'habitudes' && <HabitudesTab onDayClick={setSelectedDay} />}
        {tab === 'constance' && <ConstanceTab />}
      </div>

      {selectedDay && (
        <DayDetailModal date={selectedDay} onClose={() => setSelectedDay(null)} />
      )}
    </div>
  )
}
