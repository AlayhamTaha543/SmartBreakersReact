import { AlertTriangle, Battery, Cloud, CloudFog, CloudLightning, CloudRain, Gauge, Grid3X3, Pause, Play, PlugZap, Sun, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ThemeToggle } from '../components/ThemeToggle'
import { breakerDrawW } from '../simulation/physics'
import type { SimulatedBreaker, WeatherCondition } from '../simulation/types'
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

function TopBar() {
  const { dashboard, configuration, running, toggleRunning } = useSimulator()
  return (
    <header className="sticky top-0 z-30 border-b border-outline bg-surface/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3">
        <div>
          <Link className="flex items-center gap-2 text-lg font-bold text-primary" to="/"><PlugZap size={23} /> SmartBreaker</Link>
          <p className="mt-1 text-[10px] uppercase tracking-wider text-muted">{dashboard.organization} · Org {configuration.connections.organization}</p>
        </div>
        <time className="data-value text-sm font-semibold sm:text-lg">{clock(dashboard.simMs)}</time>
        <nav className="flex items-center gap-2" aria-label="Simulator navigation">
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
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value.enabled}
      aria-label={(tier === 'T1' ? 'Tier-1 safety' : 'Tier-2 controller') + ' enabled'}
      className={'panel w-full p-4 text-left transition hover:border-primary ' + (value.enabled ? 'border-secondary/60' : '')}
      onClick={() => setTierEnabled(tier, !value.enabled)}
    >
      <div className="flex items-center justify-between">
        <span className="eyebrow">{tier === 'T1' ? 'Tier-1 · local bridge' : 'Tier-2 · Django KBS'}</span>
        <span className={'rounded px-2 py-1 text-[10px] font-bold ' + (value.enabled ? 'bg-secondary/10 text-secondary' : 'bg-surface-highest text-muted')}>{value.enabled ? 'ENABLED' : 'DISABLED'}</span>
      </div>
      <p className={'mt-3 text-sm font-semibold ' + (value.connected ? 'text-secondary' : value.enabled ? 'text-danger' : 'text-muted')}>
        {value.connected ? 'Connected' : value.status}
      </p>
      <p className="mt-1 truncate font-mono text-[10px] text-muted">{value.engine ?? 'No engine response yet'}</p>
      <p className="mt-2 text-xs text-ink">{tier === 'T1' ? 'Situation: ' + (value.situation || 'none') : 'Branch: ' + (value.branch || 'none')}</p>
    </button>
  )
}

function BreakerCard({ breaker }: { breaker: SimulatedBreaker }) {
  const { dashboard, toggleBreaker } = useSimulator()
  const draw = breakerDrawW(breaker, dashboard.simMs)
  const blocked = !breaker.switchOn && breaker.priorityType !== 'ac_grid' && Boolean(dashboard.tier1.situation)
  return (
    <button
      type="button"
      role="switch"
      aria-checked={breaker.switchOn}
      aria-label={breaker.deviceId + ' breaker ' + (breaker.switchOn ? 'on' : 'off')}
      title={blocked ? 'Manual ON is blocked while Tier-1 danger is active' : 'Toggle simulated breaker'}
      onClick={() => void toggleBreaker(breaker.deviceId, !breaker.switchOn)}
      className={'relative rounded border p-4 text-left transition hover:-translate-y-0.5 hover:border-primary ' +
        (breaker.switchOn ? 'border-secondary/60 bg-secondary/[.04]' : 'border-outline bg-surface-lowest')}
    >
      <span className={'absolute right-3 top-3 h-2 w-2 rounded-full ' + (breaker.switchOn ? 'bg-secondary shadow-active' : 'bg-muted')} />
      <p className="font-mono text-[10px] uppercase text-muted">{breaker.priorityType} · P{breaker.priorityDegree}</p>
      <h3 className="mt-1 font-semibold">{breaker.deviceId}</h3>
      <div className="mt-4 flex items-end justify-between">
        <span className={breaker.switchOn ? 'eyebrow text-secondary' : 'eyebrow'}>{breaker.switchOn ? 'ON' : 'OFF'}</span>
        <span className="data-value text-lg">{Math.round(draw)} W</span>
      </div>
      {breaker.countdownS > 0 && <p className="mt-2 text-xs text-tertiary">OFF in {breaker.countdownS}s simulated</p>}
      {breaker.lockedOut && <p className="mt-2 text-xs text-danger">Lockout: {breaker.lockoutReason}</p>}
      {blocked && <p className="mt-2 text-xs text-danger">Tier-1 blocks ON</p>}
    </button>
  )
}

function History({ values }: { values: number[] }) {
  const max = Math.max(1, ...values)
  if (!values.length) return <p className="py-8 text-center text-xs text-muted">History starts when climate data and physics are active.</p>
  const points = values.map((value, index) => ((index / Math.max(values.length - 1, 1)) * 100) + ',' + (42 - value / max * 36)).join(' ')
  return <svg className="h-28 w-full" viewBox="0 0 100 44" preserveAspectRatio="none" role="img" aria-label="Bounded live PV production history"><polyline points={points} fill="none" stroke="#45dfa4" strokeWidth="1" vectorEffect="non-scaling-stroke" /></svg>
}

export function DashboardV2() {
  const { dashboard, configuration } = useSimulator()
  const row = dashboard.climate
  const flow = dashboard.flow
  const WeatherIcon = weatherIcon[dashboard.weather]
  const source = flow?.empty ? 'BLACKOUT' : flow?.gridSupplying ? 'GRID' : flow && flow.dischargeW > 0 ? 'BATTERY' : 'SOLAR'
  return (
    <div className="min-h-screen bg-surface text-ink">
      <TopBar />
      <main className="mx-auto grid max-w-[1800px] gap-3 p-3 xl:grid-cols-[1fr_1.55fr_1fr]">
        <div className="grid content-start gap-3">
          {dashboard.climateError && (
            <section className="panel border-danger/60 p-4" role="alert">
              <div className="flex gap-3"><AlertTriangle className="shrink-0 text-danger" />
                <div><h2 className="font-semibold">Climate data unavailable</h2><p className="mt-1 text-xs text-muted">{dashboard.climateError}</p><p className="mt-2 text-xs">Physics is paused instead of inventing weather values.</p></div>
              </div>
            </section>
          )}
          <section className="panel p-4">
            <div className="flex items-start justify-between">
              <div><p className="eyebrow">CSV climate environment</p><h2 className="mt-1 text-2xl font-semibold">{configuration.site.city}</h2>
                <span className="mt-2 inline-block rounded bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">{dashboard.weatherMode}</span>
              </div>
              <div className="text-right"><WeatherIcon className="ml-auto text-primary" size={36} /><p className="mt-2 text-xs font-bold uppercase">{dashboard.weather.replace('_', ' ')}</p></div>
            </div>
            {row && <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <Reading label="Typical" value={row.typical_weather.replace('_', ' ')} />
              <Reading label="Season" value={row.season} />
              <Reading label="Temperature" value={row.temp_C.toFixed(1) + ' °C'} />
              <Reading label="Humidity" value={row.humidity_percent.toFixed(1) + '%'} />
              <Reading label="Cloud" value={row.cloud_amount_percent.toFixed(1) + '%'} />
              <Reading label="Rain" value={row.precip_mm_day.toFixed(2) + ' mm/day'} />
              <Reading label="GHI" value={row.ghi_kwh_m2_day.toFixed(2) + ' kWh/m²/day'} />
              <Reading label="Clear-sky GHI" value={row.clearsky_ghi_kwh_m2_day.toFixed(2)} />
            </div>}
            <div className="mt-3 rounded bg-surface-lowest p-3 text-xs">
              <p className="eyebrow">Separate Tier-2 fact</p>
              <p className="mt-1 font-mono text-primary">weather_condition = {dashboard.backendWeatherCondition ?? 'not reported'}</p>
            </div>
          </section>
          <section className="grid grid-cols-2 gap-3"><TierCard tier="T1" /><TierCard tier="T2" /></section>
        </div>

        <div className="grid content-start gap-3">
          <section className="panel p-4">
            <div className="mb-4 flex items-center justify-between"><h2 className="eyebrow">Physical power flow</h2><span className="rounded bg-surface-highest px-2 py-1 text-[10px] font-bold">{source}</span></div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Power label="PV adjusted" value={flow?.pvW ?? 0} icon={Sun} tone="text-secondary" />
              <Power label="PV clear sky" value={flow?.clearSkyW ?? 0} icon={Zap} tone="text-primary" />
              <Power label="Site load" value={flow?.loadW ?? 0} icon={Gauge} tone="text-tertiary" />
              <Power label="Grid input" value={flow?.gridSupplying ? flow.loadW : 0} icon={Grid3X3} tone="text-ink" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Reading label="Battery SOC" value={((flow?.socFrac ?? 0) * 100).toFixed(1) + '%'} />
              <Reading label="Battery" value={(flow?.batteryVoltageV ?? 0).toFixed(2) + ' V'} />
              <Reading label="Heatsink" value={(flow?.heatsinkC ?? 0).toFixed(1) + ' °C'} />
              <Reading label="Sunrise / sunset" value={sunTime(flow?.sunriseH) + ' / ' + sunTime(flow?.sunsetH)} />
            </div>
          </section>

          <section className="panel p-4">
            <div className="mb-4 flex items-center justify-between"><h2 className="eyebrow">Breaker panel · manual control</h2><span className="text-[10px] uppercase text-muted">{dashboard.breakers.filter((item) => item.switchOn).length} active</span></div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{dashboard.breakers.map((breaker) => <BreakerCard breaker={breaker} key={breaker.deviceId} />)}</div>
          </section>

          <section className="panel p-4"><div className="flex items-center justify-between"><h2 className="eyebrow">Live PV history</h2><span className="font-mono text-[10px] text-muted">{dashboard.pvHistory.length}/96 samples</span></div><History values={dashboard.pvHistory} /></section>
        </div>

        <div className="grid min-w-0 content-start gap-3">
          <section className="panel p-4">
            <h2 className="eyebrow">Active decisions</h2>
            <div className="mt-3 space-y-2">
              <Reading label="Tier-2 branch" value={dashboard.lastBranch ?? 'none'} />
              <Reading label="Tier-1 situation" value={dashboard.tier1.situation || 'none'} />
              <Reading label="Countdowns" value={String(dashboard.countdowns.length)} />
              <Reading label="Grid breaker" value={flow?.gridOn ? (flow.gridSupplying ? 'ON · supplying' : 'ON · no grid') : 'OFF'} />
            </div>
          </section>
          <section className="panel max-h-64 overflow-hidden p-4">
            <h2 className="eyebrow mb-3">Alerts</h2>
            <div className="thin-scrollbar max-h-48 space-y-2 overflow-y-auto">
              {!dashboard.alerts.length && <p className="text-xs text-muted">No Tier-2 alerts reported.</p>}
              {dashboard.alerts.map((alert) => <article className="rounded bg-surface-lowest p-3 text-xs" key={alert.created_at + alert.kind}><div className="flex justify-between"><strong className={alert.severity === 'critical' ? 'text-danger' : 'text-tertiary'}>{alert.kind}</strong><span className="text-muted">{alert.severity}</span></div><p className="mt-1 text-muted">{alert.message}</p></article>)}
            </div>
          </section>
          <section className="panel p-4">
            <h2 className="eyebrow mb-3">Python evidence stream</h2>
            <div className="thin-scrollbar max-h-[430px] space-y-2 overflow-y-auto">
              {!dashboard.evidence.length && <p className="text-xs text-muted">Enable a tier to collect engine facts, rules, commands, and ACKs.</p>}
              {dashboard.evidence.map((entry) => <article className="rounded border border-outline/60 bg-surface-lowest p-3 text-xs" key={entry.id}><div className="flex items-center justify-between"><strong className={entry.tier === 'T1' ? 'text-tertiary' : entry.tier === 'T2' ? 'text-primary' : 'text-secondary'}>{entry.tier} · {entry.kind}</strong><time className="font-mono text-[9px] text-muted">{new Date(entry.timestamp).toLocaleTimeString()}</time></div><p className="mt-1 break-words text-muted">{entry.message}</p></article>)}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

function Reading({ label, value }: { label: string; value: string }) {
  return <div className="rounded bg-surface-lowest p-2"><span className="block text-[9px] font-bold uppercase tracking-wider text-muted">{label}</span><strong className="mt-1 block truncate font-mono text-xs" title={value}>{value}</strong></div>
}
function Power({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Battery; tone: string }) {
  return <div className="rounded border border-outline bg-surface-lowest p-3"><Icon className={tone} size={18} /><span className="mt-3 block text-[9px] font-bold uppercase text-muted">{label}</span><strong className="data-value mt-1 block text-lg">{Math.round(value)} <small className="text-[10px] text-muted">W</small></strong></div>
}
