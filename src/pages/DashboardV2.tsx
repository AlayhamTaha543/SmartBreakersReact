import {
  AlertTriangle, Battery, Cloud, CloudFog, CloudLightning, CloudRain,
  Gauge, Grid3X3, ListTree, LoaderCircle, Pause, Play, Sun, Zap,
} from 'lucide-react'
import { useState } from 'react'
import { AppShell } from '../components/AppShell'
import { BreakerDeviceIcon, breakerVisual } from '../components/BreakerDeviceIcon'
import { FuzzyDecisionFlow } from '../components/FuzzyDecisionFlow'
import { PageTabs } from '../components/PageTabs'
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
type DecisionView = 'overview' | 'alerts' | 'evidence'

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

function SimulationClock() {
  const { dashboard, running } = useSimulator()
  return <div className="simulation-clock" aria-label={running ? 'Simulation live' : 'Simulation paused'}>
    <span className={'h-2 w-2 shrink-0 rounded-full ' + (running ? 'animate-pulse-soft bg-secondary shadow-active' : 'bg-warning')} />
    <span className="min-w-0">
      <strong className={running ? 'text-secondary' : 'text-warning'}>{running ? 'Live' : 'Paused'}</strong>
      <time className="data-value block truncate">{clock(dashboard.simMs)}</time>
    </span>
  </div>
}

function TierCard({ tier }: { tier: 'T1' | 'T2' }) {
  const { dashboard, setTierEnabled } = useSimulator()
  const current = tier === 'T1' ? dashboard.tier1 : dashboard.tier2
  const hasDecision = Boolean(tier === 'T1' ? current.situation : current.branch)
  return <button
    type="button"
    role="switch"
    aria-checked={current.enabled}
    aria-label={(tier === 'T1' ? 'Tier-1 safety' : 'Tier-2 controller') + ' enabled'}
    className={'panel relative w-full overflow-hidden p-4 text-left transition hover:-translate-y-0.5 hover:border-primary ' +
      (hasDecision ? 'border-warning/60 bg-warning/[.04]' : current.enabled ? 'border-secondary/50 bg-secondary/[.03]' : '')}
    onClick={() => setTierEnabled(tier, !current.enabled)}
  >
    <span className={'absolute inset-y-0 left-0 w-1 ' + (hasDecision ? 'bg-warning' : current.enabled ? 'bg-secondary' : 'bg-outline')} />
    <span className="flex items-center justify-between gap-2">
      <span className="eyebrow">{tier === 'T1' ? 'Tier-1 · local safety' : 'Tier-2 · Django KBS'}</span>
      <span className={'event-badge ' + (current.enabled ? 'border-secondary/30 bg-secondary/10 text-secondary' : 'border-outline bg-surface-high text-muted')}>
        {current.enabled ? 'Enabled' : 'Disabled'}
      </span>
    </span>
    <strong className={'mt-3 block text-sm ' + (current.connected ? 'text-secondary' : current.enabled ? 'text-danger' : 'text-muted')}>
      {current.connected ? 'Connected' : current.status}
    </strong>
    <span className="mt-1 block break-words font-mono text-[11px] leading-4 text-muted">{current.engine ?? 'No engine response yet'}</span>
    <span className={'mt-2 block text-xs ' + (hasDecision ? 'font-semibold text-warning' : 'text-ink')}>
      {tier === 'T1' ? 'Situation: ' + (current.situation || 'none') : 'Branch: ' + (current.branch || 'none')}
    </span>
  </button>
}

function BreakerCard({ breaker }: { breaker: SimulatedBreaker }) {
  const { dashboard, toggleBreaker } = useSimulator()
  const visual = breakerVisual(breaker.deviceId)
  const draw = breakerDrawW(breaker, dashboard.simMs)
  const blocked = !breaker.switchOn && breaker.priorityType !== 'ac_grid' && Boolean(dashboard.tier1.situation)
  const attention = breaker.lockedOut || blocked ? 'danger' : breaker.countdownS > 0 ? 'warning' : breaker.switchOn ? 'success' : 'neutral'
  const accent = attention === 'danger' ? 'bg-danger' : attention === 'warning' ? 'bg-warning' : attention === 'success' ? 'bg-secondary' : 'bg-outline'
  return <button
    type="button"
    role="switch"
    aria-checked={breaker.switchOn}
    aria-label={breaker.deviceId + ' breaker ' + (breaker.switchOn ? 'on' : 'off')}
    title={blocked ? 'Manual ON is blocked while Tier-1 danger is active' : 'Toggle simulated breaker'}
    onClick={() => void toggleBreaker(breaker.deviceId, !breaker.switchOn)}
    className={'relative min-h-44 overflow-hidden rounded-lg border p-4 text-left transition hover:-translate-y-0.5 hover:border-primary ' +
      (attention === 'danger' ? 'border-danger/50 bg-danger/[.04]' : attention === 'warning' ? 'border-warning/50 bg-warning/[.04]' : breaker.switchOn ? 'border-secondary/50 bg-secondary/[.04]' : 'border-outline bg-surface-lowest')}
  >
    <span className={'absolute inset-x-0 top-0 h-1 ' + accent} />
    <span className={'absolute right-3 top-4 h-2 w-2 rounded-full ' + (breaker.switchOn ? 'bg-secondary shadow-active' : attention === 'danger' ? 'bg-danger' : 'bg-muted')} />
    <span className="flex items-start gap-3 pr-4">
      <BreakerDeviceIcon deviceId={breaker.deviceId} />
      <span className="min-w-0">
        <strong className="block break-words text-sm leading-5">{visual.label}</strong>
        <span className="mt-0.5 block break-all font-mono text-[11px] leading-4 text-muted">{breaker.deviceId}</span>
        <span className="mt-1 block text-[11px] font-bold uppercase tracking-wider text-muted">{breaker.priorityType} · P{breaker.priorityDegree}</span>
      </span>
    </span>
    <span className="mt-4 flex items-end justify-between border-t border-outline/60 pt-3">
      <span className={breaker.switchOn ? 'eyebrow text-secondary' : 'eyebrow'}>{breaker.switchOn ? 'ON' : 'OFF'}</span>
      <span className="data-value text-xl font-semibold">{Math.round(draw)} <small className="text-xs text-muted">W</small></span>
    </span>
    {breaker.countdownS > 0 && <span className="mt-2 block rounded bg-warning/10 px-2 py-1 text-xs font-semibold text-warning">OFF in {breaker.countdownS}s simulated</span>}
    {breaker.lockedOut && <span className="mt-2 block rounded bg-danger/10 px-2 py-1 text-xs font-semibold text-danger">Lockout: {breaker.lockoutReason}</span>}
    {blocked && <span className="mt-2 block rounded bg-danger/10 px-2 py-1 text-xs font-semibold text-danger">Tier-1 blocks ON</span>}
  </button>
}

export function DashboardV2() {
  const { dashboard, configuration, running, toggleRunning } = useSimulator()
  const [decisionView, setDecisionView] = useState<DecisionView>('overview')
  const row = dashboard.climate
  const flow = dashboard.flow
  const WeatherIcon = weatherIcon[dashboard.weather]
  const source = flow?.empty ? 'BLACKOUT' : flow?.gridSupplying ? 'GRID' : flow && flow.dischargeW > 0 ? 'BATTERY' : 'SOLAR'
  const sourceBadge = source === 'BLACKOUT' ? 'border-danger/30 bg-danger/10 text-danger' : source === 'SOLAR' ? 'border-warning/30 bg-warning/10 text-warning' : source === 'BATTERY' ? 'border-tertiary/30 bg-tertiary/10 text-tertiary' : 'border-primary/30 bg-primary/10 text-primary'
  const policy = dashboard.tier2.policy ?? configuration.settings.tier2_policy
  const fuzzyCycle = dashboard.tier2.latestFuzzyCycle ?? null
  const activeBreakers = dashboard.breakers.filter((item) => item.switchOn).length

  return <AppShell
    title={dashboard.organization}
    hideContext
    status={<SimulationClock />}
    actions={<button aria-label={running ? 'Pause physics' : 'Run physics'} className="button-primary min-h-11 sm:min-h-0" type="button" onClick={toggleRunning}>
      {running ? <Pause size={15} /> : <Play size={15} />}
      <span className="hidden sm:inline">{running ? 'Pause physics' : 'Run physics'}</span>
      <span className="sm:hidden">{running ? 'Pause' : 'Run'}</span>
    </button>}
  >
    <main className="dashboard-grid mx-auto max-w-[1800px] p-3 sm:p-4">
      <section className="operation-strip" aria-label="Operational status">
        <StatusTile label="Simulation" value={running ? 'Live' : 'Paused'} tone={running ? 'success' : 'warning'} detail={clock(dashboard.simMs)} />
        <StatusTile label="Active source" value={source} tone={source === 'BLACKOUT' ? 'danger' : source === 'SOLAR' ? 'warning' : 'primary'} detail={Math.round(flow?.loadW ?? 0) + ' W site load'} />
        <StatusTile label="Battery reserve" value={((flow?.socFrac ?? 0) * 100).toFixed(1) + '%'} tone={(flow?.socFrac ?? 0) < .2 ? 'danger' : 'success'} detail={(flow?.batteryVoltageV ?? 0).toFixed(2) + ' V'} />
        <StatusTile label="Tier-1 safety" value={dashboard.tier1.enabled ? dashboard.tier1.status : 'Disabled'} tone={dashboard.tier1.connected ? 'success' : dashboard.tier1.enabled ? 'danger' : 'neutral'} detail={dashboard.tier1.situation || 'No active situation'} />
        <StatusTile label="Tier-2 control" value={dashboard.tier2.enabled ? dashboard.tier2.status : 'Disabled'} tone={dashboard.tier2.connected ? 'success' : dashboard.tier2.enabled ? 'danger' : 'neutral'} detail={dashboard.lastBranch ?? 'No active branch'} />
        <StatusTile label="Alerts" value={dashboard.alerts.length ? String(dashboard.alerts.length) : 'Clear'} tone={dashboard.alerts.length ? 'danger' : 'success'} detail={dashboard.evidence.length + ' evidence events'} />
      </section>

      {!dashboard.climate && !dashboard.climateError && <section className="panel dashboard-loading flex items-center gap-3 p-4" role="status" aria-live="polite">
        <LoaderCircle className="shrink-0 animate-spin text-primary" />
        <div><h2 className="font-semibold">Loading climate data</h2><p className="mt-1 text-xs text-muted">Preparing the physical environment from the simulator climate service.</p></div>
      </section>}

      {dashboard.climateError && <section className="panel dashboard-error border-danger/60 p-4" role="alert">
        <div className="flex gap-3"><AlertTriangle className="shrink-0 text-danger" />
          <div><h2 className="font-semibold">Climate data unavailable</h2><p className="mt-1 text-xs text-muted">{dashboard.climateError}</p><p className="mt-2 text-xs">Physics is waiting for valid climate data instead of inventing weather values.</p></div>
        </div>
      </section>}

      <section className="panel dashboard-power overflow-hidden">
        <div className="panel-header flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Physical power flow</h2>
          <span className={'event-badge ' + sourceBadge}><Zap size={12} className="mr-1" />{source}</span>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Power label="PV adjusted" value={flow?.pvW ?? 0} icon={Sun} tone="success" />
            <Power label="PV clear sky" value={flow?.clearSkyW ?? 0} icon={Zap} tone="primary" />
            <Power label="Site load" value={flow?.loadW ?? 0} icon={Gauge} tone="tertiary" />
            <Power label="Grid input" value={flow?.gridSupplying ? flow.loadW : 0} icon={Grid3X3} tone={flow?.gridSupplying ? 'primary' : 'neutral'} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Reading label="Battery SOC" value={((flow?.socFrac ?? 0) * 100).toFixed(1) + '%'} />
            <Reading label="Battery voltage" value={(flow?.batteryVoltageV ?? 0).toFixed(2) + ' V'} />
            <Reading label="Heatsink" value={(flow?.heatsinkC ?? 0).toFixed(1) + ' °C'} />
            <Reading label="Sunrise / sunset" value={sunTime(flow?.sunriseH) + ' / ' + sunTime(flow?.sunsetH)} />
          </div>
        </div>
        <div className="border-t border-outline bg-surface-lowest/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><WeatherIcon size={23} /></span>
              <div className="min-w-0"><p className="eyebrow">CSV climate environment</p><h3 className="break-words text-base font-semibold">{configuration.site.city}</h3></div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="event-badge border-primary/30 bg-primary/10 text-primary">{dashboard.weatherMode}</span>
              <span className="text-[11px] font-bold uppercase text-muted">{dashboard.weather.replace('_', ' ')}</span>
            </div>
          </div>
          {row && <div className="mt-3 grid grid-cols-3 overflow-hidden rounded-md border border-outline bg-surface-container">
            <ClimateMetric label="Temperature" value={row.temp_C.toFixed(1) + ' °C'} />
            <ClimateMetric label="Humidity" value={row.humidity_percent.toFixed(0) + '%'} />
            <ClimateMetric label="Solar GHI" value={row.ghi_kwh_m2_day.toFixed(1)} unit="kWh/m²" />
          </div>}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]"><span className="text-muted">{row ? row.season + ' · ' + row.cloud_amount_percent.toFixed(0) + '% cloud' : 'Climate row unavailable'}</span><span className="font-mono text-primary">Tier-2: {dashboard.backendWeatherCondition ?? 'not reported'}</span></div>
        </div>
      </section>

      <section className="panel dashboard-breakers p-4">
        <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Breaker panel</h2><p className="mt-1 text-[11px] text-muted">Manual control with Tier-1 safety enforcement</p></div><span className="event-badge border-secondary/30 bg-secondary/10 text-secondary">{activeBreakers} active</span></div>
        <div className="breaker-grid">{dashboard.breakers.map((breaker) => <BreakerCard breaker={breaker} key={breaker.deviceId} />)}</div>
      </section>

      <section className="dashboard-tiers grid content-start gap-3">
        <TierCard tier="T1" />
        <TierCard tier="T2" />
      </section>

      <section className="panel dashboard-decisions min-w-0 overflow-hidden">
        <div className="panel-header flex items-center justify-between gap-3">
          <div><h2 className="text-sm font-semibold">Decision center</h2><p className="mt-1 text-[11px] text-muted">Control state, alerts, and Python evidence</p></div>
          <span className={'event-badge ' + (dashboard.lastBranch || dashboard.tier1.situation ? 'border-warning/30 bg-warning/10 text-warning' : 'border-secondary/30 bg-secondary/10 text-secondary')}>
            {dashboard.lastBranch || dashboard.tier1.situation ? 'Decision active' : 'Monitoring'}
          </span>
        </div>
        <PageTabs
          label="Decision center views"
          value={decisionView}
          onChange={setDecisionView}
          tabs={[
            { value: 'overview', label: 'Overview' },
            { value: 'alerts', label: 'Alerts', badge: dashboard.alerts.length },
            { value: 'evidence', label: 'Evidence', badge: dashboard.evidence.length },
          ]}
        />
        <div hidden={decisionView !== 'overview'} id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" className="grid gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.6fr)]">
          <div className="grid grid-cols-2 gap-2">
            <Reading label="Tier-2 branch" value={dashboard.lastBranch ?? 'none'} tone={dashboard.lastBranch ? 'primary' : undefined} />
            <Reading label="Tier-1 situation" value={dashboard.tier1.situation || 'none'} tone={dashboard.tier1.situation ? 'danger' : undefined} />
            <Reading label="Countdowns" value={String(dashboard.countdowns.length)} tone={dashboard.countdowns.length ? 'warning' : undefined} />
            <Reading label="Grid breaker" value={flow?.gridOn ? (flow.gridSupplying ? 'ON · supplying' : 'ON · no grid') : 'OFF'} tone={flow?.gridSupplying ? 'primary' : undefined} />
          </div>
          <div className="rounded-lg border border-outline bg-surface-lowest p-3">
            <div className="flex items-center justify-between gap-2"><span className="eyebrow">Fuzzy supervisor</span><span className="event-badge border-primary/30 bg-primary/10 text-primary">{policy.replaceAll('_', ' ')}</span></div>
            <p className="mt-3 text-sm font-semibold">{fuzzyCycle ? (fuzzyCycle.evaluation.risk_band ?? 'No risk band') + ' risk band' : policy === 'crisp' ? 'Crisp controller authoritative' : 'Awaiting fuzzy evaluation'}</p>
            <p className="mt-1 text-xs leading-5 text-muted">{fuzzyCycle ? (fuzzyCycle.executedBranch ?? 'No command selected') : 'Open the detailed decision flow below for inference evidence.'}</p>
          </div>
        </div>
        <div hidden={decisionView !== 'alerts'} id="panel-alerts" role="tabpanel" aria-labelledby="tab-alerts" className="thin-scrollbar max-h-[520px] space-y-2 overflow-y-auto p-4">
          {!dashboard.alerts.length && <div className="rounded-lg border border-secondary/20 bg-secondary/[.05] p-4"><p className="text-sm font-semibold text-secondary">All clear</p><p className="mt-1 text-xs text-muted">No Tier-2 alerts reported.</p></div>}
          {dashboard.alerts.map((alert, index) => {
            const tone = alert.severity === 'critical' ? 'danger' : alert.severity === 'warning' ? 'warning' : 'primary'
            return <article className="event-card p-3 text-xs" data-tone={tone} key={alert.created_at + alert.kind}><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><strong className={tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-primary'}>{alert.kind}</strong>{index === 0 && <span className={badgeClass(tone)}>Latest</span>}</div><span className="font-mono text-[11px] uppercase text-muted">{alert.severity}</span></div><p className="mt-2 leading-5 text-muted">{alert.message}</p></article>
          })}
        </div>
        <div hidden={decisionView !== 'evidence'} id="panel-evidence" role="tabpanel" aria-labelledby="tab-evidence" className="thin-scrollbar max-h-[620px] space-y-2 overflow-y-auto p-4" aria-live="polite">
          {!dashboard.evidence.length && <p className="rounded-lg border border-dashed border-outline p-4 text-xs leading-5 text-muted">Enable a tier to collect engine facts, rules, commands, and acknowledgements.</p>}
          {dashboard.evidence.map((entry, index) => {
            const tone = evidenceTone(entry.kind)
            return <article className="event-card p-3 text-xs" data-tone={tone} key={entry.id}><div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><span className={badgeClass(tone)}>{entry.kind}</span><strong className={entry.tier === 'T1' ? 'text-tertiary' : entry.tier === 'T2' ? 'text-primary' : 'text-secondary'}>{entry.tier}</strong>{index === 0 && <span className="event-badge border-secondary/30 bg-secondary/10 text-secondary">New</span>}</div><time className="shrink-0 font-mono text-[11px] text-muted">{new Date(entry.timestamp).toLocaleTimeString()}</time></div><p className="mt-2 break-words leading-5 text-muted">{entry.message}</p></article>
          })}
        </div>
      </section>

      <details className="panel dashboard-fuzzy overflow-hidden" open={policy !== 'crisp'}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
          <span className="flex items-center gap-3"><ListTree className="text-primary" size={19} /><span><strong className="block text-sm">Detailed fuzzy decision flow</strong><small className="mt-1 block text-[11px] text-muted">Normalized inputs, memberships, rules, bands, and executed path</small></span></span>
          <span className="event-badge border-primary/30 bg-primary/10 text-primary">{fuzzyCycle ? 'Available' : 'Waiting'}</span>
        </summary>
        <div className="border-t border-outline"><FuzzyDecisionFlow cycle={fuzzyCycle} policy={policy} title="Latest fuzzy decision cycle" /></div>
      </details>
    </main>
  </AppShell>
}

function StatusTile({ label, value, detail, tone = 'neutral' }: { label: string; value: string; detail: string; tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' }) {
  const valueClass = tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-secondary' : tone === 'primary' ? 'text-primary' : 'text-ink'
  return <div className="status-tile" data-tone={tone}><span className="eyebrow">{label}</span><strong className={'mt-1 block truncate text-sm ' + valueClass} title={value}>{value}</strong><span className="mt-1 block truncate text-[11px] text-muted" title={detail}>{detail}</span></div>
}
function Reading({ label, value, tone }: { label: string; value: string; tone?: 'primary' | 'success' | 'warning' | 'danger' }) {
  const valueClass = tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-secondary' : tone === 'primary' ? 'text-primary' : 'text-ink'
  return <div className="metric-tile p-3" data-tone={tone}><span className="block text-[11px] font-bold uppercase tracking-wider text-muted">{label}</span><strong className={'mt-1.5 block break-words font-mono text-sm ' + valueClass} title={value}>{value}</strong></div>
}
function Power({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Battery; tone: AccentTone | 'solar' }) {
  const iconClass = tone === 'success' ? 'text-secondary' : tone === 'primary' ? 'text-primary' : tone === 'tertiary' ? 'text-tertiary' : tone === 'solar' ? 'text-warning' : tone === 'danger' ? 'text-danger' : 'text-muted'
  return <div className="power-card p-3 sm:p-4" data-tone={tone}><div className={'inline-flex rounded-md bg-surface-container p-2 ' + iconClass}><Icon size={20} /></div><span className="mt-3 block text-[11px] font-bold uppercase leading-4 tracking-wide text-muted">{label}</span><strong className="data-value mt-1 block text-xl font-semibold sm:text-2xl">{Math.round(value)} <small className="text-xs font-medium text-muted">W</small></strong></div>
}
function ClimateMetric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return <div className="border-r border-outline px-2 py-2.5 text-center last:border-r-0"><span className="block text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span><strong className="mt-1 block font-mono text-sm text-ink">{value} {unit && <small className="text-[10px] text-muted">{unit}</small>}</strong></div>
}
