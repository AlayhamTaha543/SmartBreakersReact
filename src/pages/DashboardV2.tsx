import { AlertTriangle, Battery, Cloud, CloudFog, CloudLightning, CloudRain, Gauge, Grid3X3, Pause, Play, PlugZap, Sun, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BreakerDeviceIcon, breakerVisual } from '../components/BreakerDeviceIcon'
import { FuzzyDecisionFlow } from '../components/FuzzyDecisionFlow'
import { ThemeToggle } from '../components/ThemeToggle'
import { breakerDrawW } from '../simulation/physics'
import type { EvidenceEvent, SimulatedBreaker, WeatherCondition } from '../simulation/types'
import { useSimulator } from '../state/SimulatorContext'

const weatherIcon: Record<WeatherCondition, typeof Sun> = {
  sunny: Sun, partly_cloudy: Cloud, cloudy: Cloud, rainy: CloudRain, storm: CloudLightning, foggy: CloudFog,
}
const clock = (value: number) => new Date(value).toLocaleString()
const sunTime = (value: number | null | undefined) => {
  if (value == null) return '—'
  const hours = Math.floor(value)
  return String(hours).padStart(2, '0') + ':' + String(Math.round((value - hours) * 60)).padStart(2, '0')
}

type AccentTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'tertiary'

const evidenceTone = (kind: EvidenceEvent['kind']): AccentTone => {
  if (kind === 'ERROR') return 'danger'
  if (kind === 'ALERT') return 'warning'
  if (kind === 'ACK') return 'success'
  if (kind === 'COMMAND') return 'tertiary'
  if (kind === 'RULE' || kind === 'FACT') return 'primary'
  return 'neutral'
}

const badgeClass = (tone: AccentTone) => {
  if (tone === 'danger') return 'event-badge border-danger/30 bg-danger/10 text-danger'
  if (tone === 'warning') return 'event-badge border-warning/30 bg-warning/10 text-warning'
  if (tone === 'success') return 'event-badge border-secondary/30 bg-secondary/10 text-secondary'
  if (tone === 'tertiary') return 'event-badge border-tertiary/30 bg-tertiary/10 text-tertiary'
  if (tone === 'primary') return 'event-badge border-primary/30 bg-primary/10 text-primary'
  return 'event-badge border-outline bg-surface-high text-muted'
}

function TopBar() {
  const { dashboard, configuration, running, toggleRunning } = useSimulator()
  return (
    <header className="sticky top-0 z-30 border-b border-outline bg-surface/90 px-4 py-3 shadow-sm backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-strong to-secondary text-on-primary shadow-active"><PlugZap size={22} /></span>
          <div>
            <Link className="text-lg font-bold text-ink transition hover:text-primary" to="/">SmartBreaker</Link>
            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">{dashboard.organization} · Org {configuration.connections.organization}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-full border border-outline bg-surface-lowest px-3 py-2">
          <span className={'h-2 w-2 rounded-full ' + (running ? 'animate-pulse-soft bg-secondary shadow-active' : 'bg-warning')} />
          <div><p className={'text-[9px] font-bold uppercase tracking-wider ' + (running ? 'text-secondary' : 'text-warning')}>{running ? 'Simulation live' : 'Simulation paused'}</p><time className="data-value block text-xs font-semibold sm:text-sm">{clock(dashboard.simMs)}</time></div>
        </div>
        <nav className="flex flex-wrap items-center justify-end gap-2" aria-label="Simulator navigation">
          <ThemeToggle />
          <Link className="button-secondary" to="/scenarios">Scenario Lab</Link>
          <Link className="button-secondary" to="/configuration">Configuration</Link>
          <button className="button-primary" type="button" onClick={toggleRunning}>
            {running ? <Pause size={15} /> : <Play size={15} />} {running ? 'Pause physics' : 'Run physics'}
          </button>
        </nav>
      </div>
    </header>
  )
}

function TierCard({ tier }: { tier: 'T1' | 'T2' }) {
  const { dashboard, setTierEnabled } = useSimulator()
  const value = tier === 'T1' ? dashboard.tier1 : dashboard.tier2
  const hasDecision = Boolean(tier === 'T1' ? value.situation : value.branch)
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value.enabled}
      aria-label={(tier === 'T1' ? 'Tier-1 safety' : 'Tier-2 controller') + ' enabled'}
      className={'panel relative w-full overflow-hidden p-4 text-left transition hover:-translate-y-0.5 hover:border-primary ' + (hasDecision ? 'border-warning/60 bg-warning/[.04]' : value.enabled ? 'border-secondary/50 bg-secondary/[.03]' : '')}
      onClick={() => setTierEnabled(tier, !value.enabled)}
    >
      <span className={'absolute inset-y-0 left-0 w-1 ' + (hasDecision ? 'bg-warning' : value.enabled ? 'bg-secondary' : 'bg-outline')} />
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow">{tier === 'T1' ? 'Tier-1 · local bridge' : 'Tier-2 · Django KBS'}</span>
        <span className={'event-badge ' + (value.enabled ? 'border-secondary/30 bg-secondary/10 text-secondary' : 'border-outline bg-surface-high text-muted')}><span className={'mr-1.5 h-1.5 w-1.5 rounded-full ' + (value.enabled ? 'bg-secondary' : 'bg-muted')} />{value.enabled ? 'Enabled' : 'Disabled'}</span>
      </div>
      <p className={'mt-3 text-sm font-semibold ' + (value.connected ? 'text-secondary' : value.enabled ? 'text-danger' : 'text-muted')}>
        {value.connected ? 'Connected' : value.status}
      </p>
      <p className="mt-1 truncate font-mono text-[10px] text-muted">{value.engine ?? 'No engine response yet'}</p>
      <p className={'mt-2 text-xs ' + (hasDecision ? 'font-semibold text-warning' : 'text-ink')}>{tier === 'T1' ? 'Situation: ' + (value.situation || 'none') : 'Branch: ' + (value.branch || 'none')}</p>
    </button>
  )
}

function FuzzySupervisorCard() {
  const { dashboard, configuration } = useSimulator()
  const policy = dashboard.tier2.policy ?? configuration.settings.tier2_policy
  return <FuzzyDecisionFlow
    cycle={dashboard.tier2.latestFuzzyCycle ?? null}
    policy={policy}
    title="Latest fuzzy decision cycle"
  />
}

function BreakerCard({ breaker }: { breaker: SimulatedBreaker }) {
  const { dashboard, toggleBreaker } = useSimulator()
  const visual = breakerVisual(breaker.deviceId)
  const draw = breakerDrawW(breaker, dashboard.simMs)
  const blocked = !breaker.switchOn && breaker.priorityType !== 'ac_grid' && Boolean(dashboard.tier1.situation)
  const attention = breaker.lockedOut || blocked ? 'danger' : breaker.countdownS > 0 ? 'warning' : breaker.switchOn ? 'success' : 'neutral'
  const accent = attention === 'danger' ? 'bg-danger' : attention === 'warning' ? 'bg-warning' : attention === 'success' ? 'bg-secondary' : 'bg-outline'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={breaker.switchOn}
      aria-label={breaker.deviceId + ' breaker ' + (breaker.switchOn ? 'on' : 'off')}
      title={blocked ? 'Manual ON is blocked while Tier-1 danger is active' : 'Toggle simulated breaker'}
      onClick={() => void toggleBreaker(breaker.deviceId, !breaker.switchOn)}
      className={'relative overflow-hidden rounded-lg border p-4 text-left transition hover:-translate-y-0.5 hover:border-primary ' +
        (attention === 'danger' ? 'border-danger/50 bg-danger/[.04]' : attention === 'warning' ? 'border-warning/50 bg-warning/[.04]' : breaker.switchOn ? 'border-secondary/50 bg-secondary/[.04]' : 'border-outline bg-surface-lowest')}
    >
      <span className={'absolute inset-x-0 top-0 h-1 ' + accent} />
      <span className={'absolute right-3 top-4 h-2 w-2 rounded-full ' + (breaker.switchOn ? 'bg-secondary shadow-active' : attention === 'danger' ? 'bg-danger' : 'bg-muted')} />
      <div className="flex items-center gap-3 pr-4">
        <BreakerDeviceIcon deviceId={breaker.deviceId} />
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{visual.label}</h3>
          <p className="mt-0.5 truncate font-mono text-[9px] text-muted">{breaker.deviceId}</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted">{breaker.priorityType} · P{breaker.priorityDegree}</p>
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between border-t border-outline/60 pt-3">
        <span className={breaker.switchOn ? 'eyebrow text-secondary' : 'eyebrow'}>{breaker.switchOn ? 'ON' : 'OFF'}</span>
        <span className="data-value text-xl font-semibold">{Math.round(draw)} <small className="text-xs text-muted">W</small></span>
      </div>
      {breaker.countdownS > 0 && <p className="mt-2 rounded bg-warning/10 px-2 py-1 text-xs font-semibold text-warning">OFF in {breaker.countdownS}s simulated</p>}
      {breaker.lockedOut && <p className="mt-2 rounded bg-danger/10 px-2 py-1 text-xs font-semibold text-danger">Lockout: {breaker.lockoutReason}</p>}
      {blocked && <p className="mt-2 rounded bg-danger/10 px-2 py-1 text-xs font-semibold text-danger">Tier-1 blocks ON</p>}
    </button>
  )
}

function History({ values }: { values: number[] }) {
  const max = Math.max(1, ...values)
  if (!values.length) return <p className="py-8 text-center text-xs text-muted">History starts when climate data and physics are active.</p>
  const coordinates = values.map((value, index) => ({ x: (index / Math.max(values.length - 1, 1)) * 100, y: 42 - value / max * 36 }))
  const points = coordinates.map(({ x, y }) => x + ',' + y).join(' ')
  const latest = coordinates.at(-1) ?? { x: 0, y: 42 }
  return <svg className="mt-3 h-28 w-full overflow-visible" viewBox="0 0 100 44" preserveAspectRatio="none" role="img" aria-label="Bounded live PV production history">
    <defs><linearGradient id="pv-history-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="rgb(var(--color-secondary))" stopOpacity=".28" /><stop offset="100%" stopColor="rgb(var(--color-secondary))" stopOpacity="0" /></linearGradient></defs>
    <line x1="0" x2="100" y1="42" y2="42" stroke="rgb(var(--color-outline))" strokeWidth=".5" vectorEffect="non-scaling-stroke" />
    <line x1="0" x2="100" y1="24" y2="24" stroke="rgb(var(--color-outline))" strokeDasharray="2 3" strokeOpacity=".55" strokeWidth=".35" vectorEffect="non-scaling-stroke" />
    <polygon points={'0,42 ' + points + ' 100,42'} fill="url(#pv-history-fill)" />
    <polyline points={points} fill="none" stroke="rgb(var(--color-secondary))" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    <circle cx={latest.x} cy={latest.y} r="1.4" fill="rgb(var(--color-secondary))" stroke="rgb(var(--color-surface-lowest))" strokeWidth=".8" vectorEffect="non-scaling-stroke" />
  </svg>
}

export function DashboardV2() {
  const { dashboard, configuration } = useSimulator()
  const row = dashboard.climate
  const flow = dashboard.flow
  const WeatherIcon = weatherIcon[dashboard.weather]
  const source = flow?.empty ? 'BLACKOUT' : flow?.gridSupplying ? 'GRID' : flow && flow.dischargeW > 0 ? 'BATTERY' : 'SOLAR'
  const sourceBadge = source === 'BLACKOUT' ? 'border-danger/30 bg-danger/10 text-danger' : source === 'SOLAR' ? 'border-warning/30 bg-warning/10 text-warning' : source === 'BATTERY' ? 'border-tertiary/30 bg-tertiary/10 text-tertiary' : 'border-primary/30 bg-primary/10 text-primary'
  return (
    <div className="min-h-screen bg-surface text-ink">
      <TopBar />
      <main className="mx-auto grid max-w-[1920px] gap-3 p-3 xl:grid-cols-[280px_minmax(0,1.8fr)_minmax(330px,0.9fr)]">
        <div className="grid content-start gap-3">
          <section className="grid gap-3"><TierCard tier="T1" /><TierCard tier="T2" /></section>
          {dashboard.climateError && (
            <section className="panel border-danger/60 p-4" role="alert">
              <div className="flex gap-3"><AlertTriangle className="shrink-0 text-danger" />
                <div><h2 className="font-semibold">Climate data unavailable</h2><p className="mt-1 text-xs text-muted">{dashboard.climateError}</p><p className="mt-2 text-xs">Physics is paused instead of inventing weather values.</p></div>
              </div>
            </section>
          )}
          <section className="panel overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><WeatherIcon size={24} /></span>
                <div className="min-w-0"><p className="eyebrow">CSV climate environment</p><h2 className="truncate text-lg font-semibold">{configuration.site.city}</h2></div>
              </div>
              <div className="text-right"><span className="event-badge border-primary/30 bg-primary/10 text-primary">{dashboard.weatherMode}</span><p className="mt-1 text-[10px] font-bold uppercase text-muted">{dashboard.weather.replace('_', ' ')}</p></div>
            </div>
            {row && <div className="grid grid-cols-3 border-y border-outline bg-surface-lowest">
              <ClimateMetric label="Temperature" value={row.temp_C.toFixed(1) + ' °C'} />
              <ClimateMetric label="Humidity" value={row.humidity_percent.toFixed(0) + '%'} />
              <ClimateMetric label="Solar GHI" value={row.ghi_kwh_m2_day.toFixed(1)} unit="kWh/m²" />
            </div>}
            {row && <p className="px-3 py-2 text-[10px] leading-4 text-muted"><span className="font-semibold text-ink">{row.season}</span> · {row.cloud_amount_percent.toFixed(0)}% cloud · {row.precip_mm_day.toFixed(1)} mm rain · clear-sky {row.clearsky_ghi_kwh_m2_day.toFixed(1)}</p>}
            <div className="flex items-center justify-between gap-2 border-t border-outline px-3 py-2 text-[10px]"><span className="text-muted">Tier-2 weather fact</span><span className="truncate font-mono text-primary">{dashboard.backendWeatherCondition ?? 'not reported'}</span></div>
          </section>
        </div>

        <div className="grid min-w-0 content-start gap-3">
          <section className="panel p-4">
            <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold">Physical power flow</h2><span className={'event-badge ' + sourceBadge}><Zap size={11} className="mr-1" />{source}</span></div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Power label="PV adjusted" value={flow?.pvW ?? 0} icon={Sun} tone="success" />
              <Power label="PV clear sky" value={flow?.clearSkyW ?? 0} icon={Zap} tone="primary" />
              <Power label="Site load" value={flow?.loadW ?? 0} icon={Gauge} tone="tertiary" />
              <Power label="Grid input" value={flow?.gridSupplying ? flow.loadW : 0} icon={Grid3X3} tone={flow?.gridSupplying ? 'primary' : 'neutral'} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Reading label="Battery SOC" value={((flow?.socFrac ?? 0) * 100).toFixed(1) + '%'} />
              <Reading label="Battery" value={(flow?.batteryVoltageV ?? 0).toFixed(2) + ' V'} />
              <Reading label="Heatsink" value={(flow?.heatsinkC ?? 0).toFixed(1) + ' °C'} />
              <Reading label="Sunrise / sunset" value={sunTime(flow?.sunriseH) + ' / ' + sunTime(flow?.sunsetH)} />
            </div>
          </section>

          <section className="panel p-4">
            <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold">Breaker panel · manual control</h2><span className="text-[10px] uppercase text-muted">{dashboard.breakers.filter((item) => item.switchOn).length} active</span></div>
            <div className="grid grid-cols-2 gap-3 2xl:grid-cols-3">{dashboard.breakers.map((breaker) => <BreakerCard breaker={breaker} key={breaker.deviceId} />)}</div>
          </section>

          <section className="panel p-4"><div className="flex items-center justify-between"><h2 className="eyebrow">Live PV history</h2><span className="font-mono text-[10px] text-muted">{dashboard.pvHistory.length}/96 samples</span></div><History values={dashboard.pvHistory} /></section>
        </div>

        <div className="grid min-w-0 content-start gap-3">
          <section className="panel p-4">
            <div className="flex items-center justify-between"><h2 className="eyebrow">Active decisions</h2><span className={'event-badge ' + (dashboard.lastBranch || dashboard.tier1.situation ? 'border-warning/30 bg-warning/10 text-warning' : 'border-outline bg-surface-high text-muted')}>{dashboard.lastBranch || dashboard.tier1.situation ? 'Decision active' : 'Monitoring'}</span></div>
            <div className="mt-3 space-y-2">
              <Reading label="Tier-2 branch" value={dashboard.lastBranch ?? 'none'} tone={dashboard.lastBranch ? 'primary' : undefined} />
              <Reading label="Tier-1 situation" value={dashboard.tier1.situation || 'none'} tone={dashboard.tier1.situation ? 'danger' : undefined} />
              <Reading label="Countdowns" value={String(dashboard.countdowns.length)} tone={dashboard.countdowns.length ? 'warning' : undefined} />
              <Reading label="Grid breaker" value={flow?.gridOn ? (flow.gridSupplying ? 'ON · supplying' : 'ON · no grid') : 'OFF'} tone={flow?.gridSupplying ? 'primary' : undefined} />
            </div>
          </section>
          <FuzzySupervisorCard />
          <section className="panel max-h-72 overflow-hidden p-4">
            <div className="mb-3 flex items-center justify-between"><h2 className="eyebrow">Alerts</h2><span className={'event-badge ' + (dashboard.alerts.length ? 'border-danger/30 bg-danger/10 text-danger' : 'border-secondary/30 bg-secondary/10 text-secondary')}>{dashboard.alerts.length || 'Clear'}</span></div>
            <div className="thin-scrollbar max-h-52 space-y-2 overflow-y-auto">
              {!dashboard.alerts.length && <div className="rounded-lg border border-secondary/20 bg-secondary/[.05] p-3"><p className="text-xs font-semibold text-secondary">All clear</p><p className="mt-1 text-[10px] text-muted">No Tier-2 alerts reported.</p></div>}
              {dashboard.alerts.map((alert, index) => {
                const tone = alert.severity === 'critical' ? 'danger' : alert.severity === 'warning' ? 'warning' : 'primary'
                return <article className="event-card p-3 text-xs" data-tone={tone} key={alert.created_at + alert.kind}><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><strong className={tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-primary'}>{alert.kind}</strong>{index === 0 && <span className={badgeClass(tone)}>Latest</span>}</div><span className="font-mono text-[9px] uppercase text-muted">{alert.severity}</span></div><p className="mt-2 text-muted">{alert.message}</p></article>
              })}
            </div>
          </section>
          <section className="panel p-4">
            <div className="mb-3 flex items-center justify-between"><div><h2 className="eyebrow">Python evidence stream</h2><p className="mt-1 text-[10px] text-muted">Newest engine activity appears first</p></div><span className="event-badge border-primary/30 bg-primary/10 text-primary">{dashboard.evidence.length} events</span></div>
            <div className="thin-scrollbar max-h-[430px] space-y-2 overflow-y-auto pr-1" aria-live="polite">
              {!dashboard.evidence.length && <p className="rounded-lg border border-dashed border-outline p-4 text-xs text-muted">Enable a tier to collect engine facts, rules, commands, and ACKs.</p>}
              {dashboard.evidence.map((entry, index) => {
                const tone = evidenceTone(entry.kind)
                return <article className="event-card p-3 text-xs" data-tone={tone} key={entry.id}><div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><span className={badgeClass(tone)}>{entry.kind}</span><strong className={entry.tier === 'T1' ? 'text-tertiary' : entry.tier === 'T2' ? 'text-primary' : 'text-secondary'}>{entry.tier}</strong>{index === 0 && <span className="event-badge border-secondary/30 bg-secondary/10 text-secondary">New</span>}</div><time className="shrink-0 font-mono text-[9px] text-muted">{new Date(entry.timestamp).toLocaleTimeString()}</time></div><p className="mt-2 break-words leading-5 text-muted">{entry.message}</p></article>
              })}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

function Reading({ label, value, tone }: { label: string; value: string; tone?: 'primary' | 'success' | 'warning' | 'danger' }) {
  const valueClass = tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-secondary' : tone === 'primary' ? 'text-primary' : 'text-ink'
  return <div className="metric-tile p-3" data-tone={tone}><span className="block text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span><strong className={'mt-1.5 block truncate font-mono text-sm ' + valueClass} title={value}>{value}</strong></div>
}
function Power({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Battery; tone: AccentTone | 'solar' }) {
  const iconClass = tone === 'success' ? 'text-secondary' : tone === 'primary' ? 'text-primary' : tone === 'tertiary' ? 'text-tertiary' : tone === 'solar' ? 'text-warning' : tone === 'danger' ? 'text-danger' : 'text-muted'
  return <div className="power-card p-4" data-tone={tone}><div className={'inline-flex rounded-md bg-surface-container p-2 ' + iconClass}><Icon size={20} /></div><span className="mt-3 block text-[11px] font-bold uppercase leading-4 tracking-wide text-muted">{label}</span><strong className="data-value mt-1 block text-2xl font-semibold">{Math.round(value)} <small className="text-xs font-medium text-muted">W</small></strong></div>
}
function ClimateMetric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return <div className="border-r border-outline px-2 py-2.5 text-center last:border-r-0"><span className="block text-[9px] font-bold uppercase tracking-wider text-muted">{label}</span><strong className="mt-1 block font-mono text-sm text-ink">{value} {unit && <small className="text-[8px] text-muted">{unit}</small>}</strong></div>
}
