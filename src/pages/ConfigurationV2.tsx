import { AlertTriangle, Database, RefreshCw, Save, Settings2, SlidersHorizontal } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { BreakerDeviceIcon, breakerVisual } from '../components/BreakerDeviceIcon'
import { PageTabs } from '../components/PageTabs'
import { cycleTiming } from '../simulation/cycleTiming'
import type { SimulatorConfiguration, SiteInputs, Tier2Policy, WeatherCondition } from '../simulation/types'
import { useSimulator } from '../state/SimulatorContext'

type ConfigurationSection = 'kbs' | 'breakers' | 'site' | 'connections'
type ConfiguredBreaker = SimulatorConfiguration['breakers'][number]

const sections: ConfigurationSection[] = ['kbs', 'breakers', 'site', 'connections']

export function ConfigurationV2() {
  const { configuration, cities, dashboard, saveConfiguration, resetConfiguration, reloadClimate } = useSimulator()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedSection = searchParams.get('section')
  const section: ConfigurationSection = sections.includes(requestedSection as ConfigurationSection)
    ? requestedSection as ConfigurationSection
    : 'kbs'
  const [draft, setDraft] = useState<SimulatorConfiguration>(() => structuredClone(configuration))
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => setDraft(structuredClone(configuration)), [configuration])

  const dirty = JSON.stringify(draft) !== JSON.stringify(configuration)
  const site = <K extends keyof SiteInputs>(key: K, value: SiteInputs[K]) =>
    setDraft((current) => ({ ...current, site: { ...current.site, [key]: value } }))
  const timing = cycleTiming(draft.settings.cycle_seconds, draft.site.scale)
  const changeSection = (next: ConfigurationSection) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('section', next)
    setSearchParams(nextParams)
  }
  const updateBreaker = (index: number, patch: Partial<ConfiguredBreaker>) =>
    setDraft((current) => ({
      ...current,
      breakers: current.breakers.map((item, at) => at === index ? { ...item, ...patch } : item),
    }))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setStatus('')
    try {
      await saveConfiguration(draft)
      setStatus('Saved locally and synchronized with the backend KBS settings.')
    } catch (error) {
      setStatus('Saved locally; backend synchronization failed: ' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setSaving(false)
    }
  }

  return <AppShell
    title="Physical Simulator & KBS Settings"
    subtitle="Backend-supported controls only · simulation and Python engines remain authoritative"
    maxWidth="standard"
  >
    <form className="mx-auto grid w-full min-w-0 max-w-[1500px] grid-cols-[minmax(0,1fr)] gap-4 p-3 pb-24 sm:p-4 sm:pb-24" onSubmit={submit}>
      {dashboard.climateError && <div className="panel flex gap-3 border-danger/50 p-4" role="alert">
        <AlertTriangle className="shrink-0 text-danger" />
        <div><strong>CSV climate data error</strong><p className="mt-1 text-xs text-muted">{dashboard.climateError}</p><button className="button-secondary mt-3" type="button" onClick={() => void reloadClimate()}><RefreshCw size={14} /> Retry climate API</button></div>
      </div>}

      <section className="panel sticky top-[109px] z-20 overflow-hidden" aria-label="Configuration sections">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline px-4 py-3">
          <div><h2 className="text-sm font-semibold">Configuration workspace</h2><p className="mt-1 text-[11px] text-muted">Changes remain in one draft as you move between sections.</p></div>
          <span className={'event-badge ' + (dirty ? 'border-warning/30 bg-warning/10 text-warning' : 'border-secondary/30 bg-secondary/10 text-secondary')}>{dirty ? 'Unsaved changes' : 'Saved'}</span>
        </div>
        <PageTabs
          label="Configuration sections"
          value={section}
          onChange={changeSection}
          tabs={[
            { value: 'kbs', label: 'KBS' },
            { value: 'breakers', label: 'Breakers', badge: draft.breakers.length },
            { value: 'site', label: 'Site' },
            { value: 'connections', label: 'Connections & Reference' },
          ]}
        />
      </section>

      {section === 'kbs' && <section id="panel-kbs" role="tabpanel" aria-labelledby="tab-kbs" className="grid gap-4">
        <section className="panel overflow-hidden">
          <Header icon={<Settings2 size={18} />} title="Editable backend KBS settings" subtitle="PATCH /api/kbs/settings/ · Python remains the only decision authority" />
          <div className="grid gap-4 p-4 lg:grid-cols-2">
            <Group title="Engine operation" tone="primary">
              <div className="grid gap-3 sm:grid-cols-2">
                <Number tone="primary" label="K cycle cadence" value={draft.settings.cycle_seconds} unit="real s" min={1} step={1} onChange={(value) => setDraft({ ...draft, settings: { ...draft.settings, cycle_seconds: value } })} />
                <Select tone="primary" label="Tier-2 policy" value={draft.settings.tier2_policy} options={['crisp', 'fuzzy_shadow', 'fuzzy_active']} onChange={(value) => setDraft({ ...draft, settings: { ...draft.settings, tier2_policy: value as Tier2Policy } })} />
                <Select tone="secondary" label="Engine mode" value={draft.settings.mode} options={['active', 'observing']} onChange={(value) => setDraft({ ...draft, settings: { ...draft.settings, mode: value as 'active' | 'observing' } })} />
                <Select tone="warning" label="Data source" value={draft.settings.data_source} options={['simulator', 'real']} onChange={(value) => setDraft({ ...draft, settings: { ...draft.settings, data_source: value as 'simulator' | 'real' } })} />
              </div>
              <Toggle tone="secondary" label="Power saving" checked={draft.settings.power_saving} onChange={(value) => setDraft({ ...draft, settings: { ...draft.settings, power_saving: value } })} />
            </Group>
            <Group title="Safety thresholds" tone="danger">
              <div className="grid gap-3 sm:grid-cols-2">
                <Number tone="danger" label="Battery floor" value={draft.settings.battery_low_voltage_V} unit="V" step={.1} onChange={(value) => setDraft({ ...draft, site: { ...draft.site, batteryFloorV: value }, settings: { ...draft.settings, battery_low_voltage_V: value } })} />
                <Number tone="warning" label="Low margin" value={draft.settings.battery_low_margin_V} unit="V" step={.1} onChange={(value) => setDraft({ ...draft, settings: { ...draft.settings, battery_low_margin_V: value } })} />
                <Number tone="tertiary" label="Shutdown buffer" value={draft.settings.battery_shutdown_buffer_percent} unit="%" step={.1} onChange={(value) => setDraft({ ...draft, settings: { ...draft.settings, battery_shutdown_buffer_percent: value } })} />
                <Number tone="tertiary" label="Joule deficit limit" value={draft.settings.joule_deficit_limit_J} unit="J" step={1000} onChange={(value) => setDraft({ ...draft, settings: { ...draft.settings, joule_deficit_limit_J: value } })} />
                <Number tone="primary" label="Grid present minimum" value={draft.settings.grid_present_min_V} unit="V" step={1} onChange={(value) => setDraft({ ...draft, settings: { ...draft.settings, grid_present_min_V: value } })} />
              </div>
            </Group>
          </div>
          <p className="border-t border-outline px-4 py-3 text-xs leading-5 text-muted">
            At {draft.site.scale}×, one {timing.realSecondsPerCycle}s React cycle advances {timing.simulatedMinutesPerCycle.toFixed(1)} simulated minutes; two-cycle confirmation takes {timing.twoCycleRealSeconds}s real / {timing.twoCycleSimulatedMinutes.toFixed(1)} simulated minutes. Severe fuzzy risk and hard safety act immediately.
          </p>
        </section>
      </section>}

      {section === 'breakers' && <section id="panel-breakers" role="tabpanel" aria-labelledby="tab-breakers" className="panel overflow-hidden">
        <Header icon={<Settings2 size={18} />} title="Breaker physical model" subtitle="Definitions survive history reset; relay state remains controlled from the dashboard" />
        <div className="hidden overflow-x-auto p-4 md:block">
          <table className="w-full min-w-[1040px] border-separate border-spacing-0 text-left text-xs">
            <thead><tr className="text-[11px] font-bold uppercase tracking-wider text-muted">
              <ConfigHeading label="Device" tone="text-ink" />
              <ConfigHeading label="Priority" tone="text-tertiary" />
              <ConfigHeading label="Degree" tone="text-primary" />
              <ConfigHeading label="Load type" tone="text-warning" />
              <ConfigHeading label="Peak power" tone="text-tertiary" />
              <ConfigHeading label="Normal power" tone="text-secondary" />
              <ConfigHeading label="Peak duration" tone="text-warning" />
              <ConfigHeading label="Online" tone="text-secondary" />
            </tr></thead>
            <tbody>{draft.breakers.map((breaker, index) => {
              const visual = breakerVisual(breaker.deviceId)
              const update = (patch: Partial<ConfiguredBreaker>) => updateBreaker(index, patch)
              return <tr className="group transition-colors hover:bg-surface-low" key={breaker.deviceId}>
                <td className="border-t border-outline p-3"><div className="flex items-center gap-3"><BreakerDeviceIcon deviceId={breaker.deviceId} compact /><div><strong className="block text-xs">{visual.label}</strong><span className="font-mono text-[11px] text-muted">{breaker.deviceId}</span></div></div></td>
                <td className="border-t border-outline p-2"><select aria-label={breaker.deviceId + ' priority'} className={'field-control !w-32 font-semibold ' + priorityFieldClass(breaker.priorityType)} value={breaker.priorityType} onChange={(event) => update({ priorityType: event.target.value as ConfiguredBreaker['priorityType'] })}>{['mandatory', 'normal', 'comfort', 'ac_grid'].map((value) => <option value={value} key={value}>{value}</option>)}</select></td>
                <td className="border-t border-outline p-2"><input aria-label={breaker.deviceId + ' priority degree'} className="field-control !w-20 !border-primary/40 !bg-primary/[.06] font-mono font-semibold !text-primary" type="number" min="1" value={breaker.priorityDegree} onChange={(event) => update({ priorityDegree: globalThis.Number(event.target.value) })} /></td>
                <td className="border-t border-outline p-2"><select aria-label={breaker.deviceId + ' load type'} className={'field-control !w-28 font-semibold ' + (breaker.loadType === 'motor' ? '!border-warning/40 !bg-warning/[.06] !text-warning' : '!border-primary/40 !bg-primary/[.06] !text-primary')} value={breaker.loadType} onChange={(event) => update({ loadType: event.target.value as ConfiguredBreaker['loadType'] })}>{['normal', 'motor'].map((value) => <option value={value} key={value}>{value}</option>)}</select></td>
                <td className="border-t border-outline p-2"><PowerInput label={breaker.deviceId + ' peak power'} value={breaker.peakW} unit="W" tone="tertiary" width="w-28" onChange={(value) => update({ peakW: value })} /></td>
                <td className="border-t border-outline p-2"><PowerInput label={breaker.deviceId + ' normal power'} value={breaker.normalW} unit="W" tone="secondary" width="w-28" onChange={(value) => update({ normalW: value })} /></td>
                <td className="border-t border-outline p-2"><PowerInput label={breaker.deviceId + ' peak duration'} value={breaker.peakMinutes} unit="min" tone="warning" width="w-24" onChange={(value) => update({ peakMinutes: value })} /></td>
                <td className="border-t border-outline p-2"><label className={'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-bold uppercase tracking-wider ' + (breaker.online ? 'border-secondary/30 bg-secondary/10 text-secondary' : 'border-outline bg-surface-high text-muted')}><input aria-label={breaker.deviceId + ' online'} className="h-4 w-4 accent-secondary" type="checkbox" checked={breaker.online} onChange={(event) => update({ online: event.target.checked })} />{breaker.online ? 'Online' : 'Offline'}</label></td>
              </tr>
            })}</tbody>
          </table>
        </div>
        <div className="grid gap-3 p-3 md:hidden">
          {draft.breakers.map((breaker, index) => <BreakerEditorCard breaker={breaker} key={breaker.deviceId} onChange={(patch) => updateBreaker(index, patch)} />)}
        </div>
      </section>}

      {section === 'site' && <section id="panel-site" role="tabpanel" aria-labelledby="tab-site" className="panel overflow-hidden">
        <Header icon={<SlidersHorizontal size={18} />} title="Physical simulator inputs" subtitle="Clock, location, CSV weather, PV, battery, grid, and inverter" />
        <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
          <Group title="Clock & location" tone="primary">
            <Text tone="primary" label="Simulated local date/time" type="datetime-local" value={draft.site.localDateTime} onChange={(value) => site('localDateTime', value)} />
            <Number tone="tertiary" label="Clock acceleration" value={draft.site.scale} unit="× real time" min={0.1} onChange={(value) => site('scale', value)} />
            <Select tone="secondary" label="CSV city" value={draft.site.city} options={cities.length ? cities : [draft.site.city]} onChange={(value) => site('city', value)} />
          </Group>
          <Group title="Weather" tone="warning">
            <Toggle tone="primary" label="Automatic CSV weather" checked={draft.site.weatherAuto} onChange={(value) => site('weatherAuto', value)} />
            <Select tone="warning" label="Manual condition" value={draft.site.manualWeather} disabled={draft.site.weatherAuto} options={(dashboard.availableWeather.length ? dashboard.availableWeather : ['sunny', 'partly_cloudy', 'cloudy', 'rainy', 'storm', 'foggy']) as string[]} onChange={(value) => site('manualWeather', value as WeatherCondition)} />
            <p className="rounded-md border border-warning/20 bg-warning/[.05] p-3 text-xs leading-5 text-muted">Automatic mode initializes from <strong className="text-ink">typical_weather</strong> and re-evaluates every 30–90 simulated minutes from CSV cloud, rain, and humidity.</p>
          </Group>
          <Group title="PV & inverter" tone="secondary">
            <Number tone="secondary" label="Maximum array output" value={draft.site.maxPvW} unit="W" min={1} onChange={(value) => site('maxPvW', value)} />
            <Number tone="warning" label="PV harvest threshold" value={draft.site.pvThresholdW} unit="W" min={0} onChange={(value) => site('pvThresholdW', value)} />
            <Number tone="primary" label="Inverter rating" value={draft.site.maxInverterW} unit="W" min={1} onChange={(value) => site('maxInverterW', value)} />
            <Number tone="tertiary" label="Initial heatsink" value={draft.site.heatsinkC} unit="°C" onChange={(value) => site('heatsinkC', value)} />
          </Group>
          <Group title="Battery & grid" tone="tertiary">
            <Number tone="primary" label="Usable capacity" value={draft.site.batteryCapacityWh} unit="Wh" min={1} onChange={(value) => site('batteryCapacityWh', value)} />
            <Number tone="secondary" label="Initial state of charge" value={draft.site.batterySocPercent} unit="%" min={0} max={100} onChange={(value) => site('batterySocPercent', value)} />
            <Number tone="tertiary" label="Nominal bank voltage" value={draft.site.batteryNominalV} unit="V" min={1} onChange={(value) => site('batteryNominalV', value)} />
            <Toggle tone="warning" label="State grid available" checked={draft.site.gridAvailable} onChange={(value) => site('gridAvailable', value)} />
          </Group>
        </div>
      </section>}

      {section === 'connections' && <section id="panel-connections" role="tabpanel" aria-labelledby="tab-connections" className="grid gap-4">
        <section className="panel overflow-hidden">
          <Header icon={<Database size={18} />} title="Local service connections" subtitle="Versioned local storage · no credentials" />
          <div className="grid gap-4 p-4 md:grid-cols-3">
            <Text tone="primary" label="Django URL" value={draft.connections.backendUrl} onChange={(value) => setDraft({ ...draft, connections: { ...draft.connections, backendUrl: value } })} />
            <Text tone="secondary" label="Tier-1 bridge URL" value={draft.connections.tier1Url} onChange={(value) => setDraft({ ...draft, connections: { ...draft.connections, tier1Url: value } })} />
            <Number tone="tertiary" label="Organization ID" value={draft.connections.organization} min={1} step={1} onChange={(value) => setDraft({ ...draft, connections: { ...draft.connections, organization: value } })} />
          </div>
        </section>
        <section className="panel overflow-hidden">
          <Header icon={<Database size={18} />} title="Read-only fact and rule branch reference" subtitle="Documentation of the real Python engines; no browser rule editor" />
          <div className="grid gap-4 p-4 md:grid-cols-2">
            <div><h3 className="eyebrow mb-2">Key facts supplied to Python</h3><Reference values={['pv_charging_power_W · load / inverter limits', 'battery_voltage_V · capacity · current', 'grid_voltage_V · breaker relay state', 'heatsink_temp_C · cumulative joule deficit', 'weather_condition (Tier-2 fact only)', 'breaker priority, schedule, lockout and event requirements']} /></div>
            <div><h3 className="eyebrow mb-2">Representative real-engine branches</h3><Reference values={['Tier-1: inverter_overheat / inverter_overload', 'Tier-1: battery_critical / battery_low / grid_outage', 'Tier-2: protect_inverter / protect_battery', 'Tier-2: day.surplus.* / day.deficit.*', 'Tier-2: day.sudden_drop.*', 'Tier-2: night.sudden_draw.* / night.normal']} /></div>
          </div>
        </section>
      </section>}

      <div className="configuration-actions">
        <div className="min-w-0">
          <button className="button-ghost" type="button" onClick={() => { resetConfiguration(); setStatus('Local defaults restored.') }}><RefreshCw size={15} /> Reset local defaults</button>
          <span className="mt-1 block truncate px-4 text-xs text-muted sm:mt-0 sm:inline" role="status" aria-label="Configuration save status" aria-live="polite">{status}</span>
        </div>
        <button className="button-primary min-h-11 shrink-0 px-6" disabled={saving || !dirty}><Save size={16} /> {saving ? 'Saving…' : 'Save & initialize'}</button>
      </div>
    </form>
  </AppShell>
}

function BreakerEditorCard({ breaker, onChange }: { breaker: ConfiguredBreaker; onChange: (patch: Partial<ConfiguredBreaker>) => void }) {
  const visual = breakerVisual(breaker.deviceId)
  return <article className="rounded-lg border border-outline bg-surface-lowest p-4">
    <div className="flex items-center justify-between gap-3 border-b border-outline pb-3">
      <div className="flex min-w-0 items-center gap-3"><BreakerDeviceIcon deviceId={breaker.deviceId} /><div className="min-w-0"><h3 className="break-words text-sm font-semibold">{visual.label}</h3><p className="break-all font-mono text-[11px] text-muted">{breaker.deviceId}</p></div></div>
      <label className={'inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-bold uppercase ' + (breaker.online ? 'border-secondary/30 bg-secondary/10 text-secondary' : 'border-outline bg-surface-high text-muted')}><input aria-label={breaker.deviceId + ' online'} type="checkbox" checked={breaker.online} onChange={(event) => onChange({ online: event.target.checked })} />{breaker.online ? 'Online' : 'Offline'}</label>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-3">
      <Select label="Priority" value={breaker.priorityType} options={['mandatory', 'normal', 'comfort', 'ac_grid']} onChange={(value) => onChange({ priorityType: value as ConfiguredBreaker['priorityType'] })} tone="tertiary" />
      <Number label="Priority degree" value={breaker.priorityDegree} min={1} step={1} onChange={(value) => onChange({ priorityDegree: value })} tone="primary" />
      <Select label="Load type" value={breaker.loadType} options={['normal', 'motor']} onChange={(value) => onChange({ loadType: value as ConfiguredBreaker['loadType'] })} tone="warning" />
      <Number label="Peak power" value={breaker.peakW} unit="W" min={0} onChange={(value) => onChange({ peakW: value })} tone="tertiary" />
      <Number label="Normal power" value={breaker.normalW} unit="W" min={0} onChange={(value) => onChange({ normalW: value })} tone="secondary" />
      <Number label="Peak duration" value={breaker.peakMinutes} unit="min" min={0} onChange={(value) => onChange({ peakMinutes: value })} tone="warning" />
    </div>
  </article>
}

function Header({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return <div className="panel-header flex items-start gap-3"><span className="mt-0.5 text-primary">{icon}</span><div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-[11px] leading-4 text-muted">{subtitle}</p></div></div>
}
type FieldTone = 'neutral' | 'primary' | 'secondary' | 'tertiary' | 'warning' | 'danger'
function fieldToneClass(tone: FieldTone) {
  if (tone === 'primary') return '!border-primary/40 !bg-primary/[.06] !text-primary'
  if (tone === 'secondary') return '!border-secondary/40 !bg-secondary/[.06] !text-secondary'
  if (tone === 'tertiary') return '!border-tertiary/40 !bg-tertiary/[.06] !text-tertiary'
  if (tone === 'warning') return '!border-warning/40 !bg-warning/[.06] !text-warning'
  if (tone === 'danger') return '!border-danger/40 !bg-danger/[.06] !text-danger'
  return ''
}
function fieldLabelClass(tone: FieldTone) {
  if (tone === 'primary') return 'text-primary'
  if (tone === 'secondary') return 'text-secondary'
  if (tone === 'tertiary') return 'text-tertiary'
  if (tone === 'warning') return 'text-warning'
  if (tone === 'danger') return 'text-danger'
  return 'text-muted'
}
function groupToneClass(tone: FieldTone) {
  if (tone === 'primary') return 'border-primary/20 bg-primary/[.025]'
  if (tone === 'secondary') return 'border-secondary/20 bg-secondary/[.025]'
  if (tone === 'tertiary') return 'border-tertiary/20 bg-tertiary/[.025]'
  if (tone === 'warning') return 'border-warning/20 bg-warning/[.025]'
  if (tone === 'danger') return 'border-danger/20 bg-danger/[.025]'
  return 'border-outline bg-surface-lowest'
}
function Group({ title, tone = 'neutral', children }: { title: string; tone?: FieldTone; children: ReactNode }) {
  return <fieldset className={'space-y-3 rounded-lg border p-3 ' + groupToneClass(tone)}><legend className={'eyebrow px-1 ' + fieldLabelClass(tone)}>{title}</legend>{children}</fieldset>
}
function Text({ label, value, onChange, type = 'text', tone = 'neutral' }: { label: string; value: string; onChange: (value: string) => void; type?: string; tone?: FieldTone }) {
  return <label><span className={'field-label ' + fieldLabelClass(tone)}>{label}</span><input className={'field-control ' + fieldToneClass(tone)} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>
}
function Number({ label, value, onChange, unit, min, max, step = .01, tone = 'neutral' }: { label: string; value: number; onChange: (value: number) => void; unit?: string; min?: number; max?: number; step?: number; tone?: FieldTone }) {
  return <label><span className={'field-label ' + fieldLabelClass(tone)}>{label}</span><div className="relative"><input className={'field-control pr-16 font-mono ' + fieldToneClass(tone)} type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(globalThis.Number(event.target.value))} />{unit && <span className="pointer-events-none absolute right-2 top-3 text-[11px] text-muted">{unit}</span>}</div></label>
}
function Select({ label, value, options, onChange, disabled = false, tone = 'neutral' }: { label: string; value: string; options: string[]; onChange: (value: string) => void; disabled?: boolean; tone?: FieldTone }) {
  return <label><span className={'field-label ' + fieldLabelClass(tone)}>{label}</span><select className={'field-control ' + fieldToneClass(tone)} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option value={option} key={option}>{option.replaceAll('_', ' ')}</option>)}</select></label>
}
function Toggle({ label, checked, onChange, tone = 'neutral' }: { label: string; checked: boolean; onChange: (value: boolean) => void; tone?: FieldTone }) {
  return <label className={'flex min-h-11 cursor-pointer items-center justify-between rounded-md border p-3 text-sm ' + fieldToneClass(tone)}><span className="font-semibold">{label}</span><input className="h-4 w-4 accent-secondary" type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>
}
function Reference({ values }: { values: string[] }) {
  return <ul className="space-y-2">{values.map((value) => <li className="rounded bg-surface-lowest p-3 font-mono text-xs leading-5 text-muted" key={value}>{value}</li>)}</ul>
}
function ConfigHeading({ label, tone }: { label: string; tone: string }) {
  return <th scope="col" className={'border-b-2 border-outline px-2 py-3 ' + tone}><span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-current" />{label}</span></th>
}
function priorityFieldClass(priority: string) {
  if (priority === 'mandatory') return '!border-tertiary/40 !bg-tertiary/[.06] !text-tertiary'
  if (priority === 'comfort') return '!border-secondary/40 !bg-secondary/[.06] !text-secondary'
  if (priority === 'ac_grid') return '!border-warning/40 !bg-warning/[.06] !text-warning'
  return '!border-primary/40 !bg-primary/[.06] !text-primary'
}
function PowerInput({ label, value, unit, tone, width, onChange }: { label: string; value: number; unit: string; tone: 'tertiary' | 'secondary' | 'warning'; width: string; onChange: (value: number) => void }) {
  const toneClass = tone === 'tertiary' ? '!border-tertiary/40 !bg-tertiary/[.06] !text-tertiary' : tone === 'secondary' ? '!border-secondary/40 !bg-secondary/[.06] !text-secondary' : '!border-warning/40 !bg-warning/[.06] !text-warning'
  return <div className={'relative ' + width}><input aria-label={label} className={'field-control pr-9 font-mono font-semibold ' + toneClass} type="number" min="0" value={value} onChange={(event) => onChange(globalThis.Number(event.target.value))} /><span className="pointer-events-none absolute right-2 top-3 text-[11px] text-muted">{unit}</span></div>
}
