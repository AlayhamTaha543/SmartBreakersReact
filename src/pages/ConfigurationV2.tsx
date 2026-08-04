import { AlertTriangle, ArrowLeft, Database, RefreshCw, Save, Settings2, SlidersHorizontal } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ThemeToggle } from '../components/ThemeToggle'
import type { SimulatorConfiguration, SiteInputs, WeatherCondition } from '../simulation/types'
import { useSimulator } from '../state/SimulatorContext'

export function ConfigurationV2() {
  const { configuration, cities, dashboard, saveConfiguration, resetConfiguration, reloadClimate } = useSimulator()
  const [draft, setDraft] = useState<SimulatorConfiguration>(() => structuredClone(configuration))
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => setDraft(structuredClone(configuration)), [configuration])

  const site = <K extends keyof SiteInputs>(key: K, value: SiteInputs[K]) =>
    setDraft((current) => ({ ...current, site: { ...current.site, [key]: value } }))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setStatus('')
    try {
      await saveConfiguration(draft)
      setStatus('Saved locally and synchronized with the backend KBS settings.')
    } catch (error) {
      setStatus('Saved locally; backend synchronization failed: ' + (error instanceof Error ? error.message : String(error)))
    } finally { setSaving(false) }
  }

  return (
    <div className="min-h-screen bg-surface text-ink">
      <header className="sticky top-0 z-30 border-b border-outline bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3">
          <Link className="flex items-center gap-2 text-primary" to="/"><ArrowLeft size={18} /> Dashboard</Link>
          <div className="text-center"><h1 className="font-semibold">Physical Simulator & KBS Settings</h1><p className="text-[10px] uppercase text-muted">Backend-supported controls only</p></div>
          <div className="flex items-center gap-2"><ThemeToggle /><Link className="button-secondary" to="/scenarios">Scenario Lab</Link></div>
        </div>
      </header>

      <form className="mx-auto grid max-w-[1500px] gap-4 p-4" onSubmit={submit}>
        {dashboard.climateError && <div className="panel flex gap-3 border-danger/50 p-4" role="alert"><AlertTriangle className="text-danger" /><div><strong>CSV climate data error</strong><p className="mt-1 text-xs text-muted">{dashboard.climateError}</p><button className="button-secondary mt-3" type="button" onClick={() => void reloadClimate()}><RefreshCw size={14} /> Retry climate API</button></div></div>}

        <section className="panel overflow-hidden">
          <Header icon={<Database size={18} />} title="Local service connections" subtitle="Versioned local storage · no credentials" />
          <div className="grid gap-4 p-4 md:grid-cols-3">
            <Text label="Django URL" value={draft.connections.backendUrl} onChange={(value) => setDraft({ ...draft, connections: { ...draft.connections, backendUrl: value } })} />
            <Text label="Tier-1 bridge URL" value={draft.connections.tier1Url} onChange={(value) => setDraft({ ...draft, connections: { ...draft.connections, tier1Url: value } })} />
            <Number label="Organization ID" value={draft.connections.organization} min={1} step={1} onChange={(value) => setDraft({ ...draft, connections: { ...draft.connections, organization: value } })} />
          </div>
        </section>

        <section className="panel overflow-hidden">
          <Header icon={<SlidersHorizontal size={18} />} title="Physical simulator inputs" subtitle="Clock, location, CSV weather, PV, battery, grid and inverter" />
          <div className="grid gap-5 p-4 md:grid-cols-2 xl:grid-cols-4">
            <Group title="Clock & location">
              <Text label="Simulated local date/time" type="datetime-local" value={draft.site.localDateTime} onChange={(value) => site('localDateTime', value)} />
              <Number label="Clock acceleration" value={draft.site.scale} unit="× real time" min={0.1} onChange={(value) => site('scale', value)} />
              <Select label="CSV city" value={draft.site.city} options={cities.length ? cities : [draft.site.city]} onChange={(value) => site('city', value)} />
            </Group>
            <Group title="Weather">
              <Toggle label="Automatic CSV weather" checked={draft.site.weatherAuto} onChange={(value) => site('weatherAuto', value)} />
              <Select label="Manual condition" value={draft.site.manualWeather} disabled={draft.site.weatherAuto} options={(dashboard.availableWeather.length ? dashboard.availableWeather : ['sunny', 'partly_cloudy', 'cloudy', 'rainy', 'storm', 'foggy']) as string[]} onChange={(value) => site('manualWeather', value as WeatherCondition)} />
              <p className="rounded bg-surface-lowest p-3 text-xs text-muted">Automatic mode initializes from <strong className="text-ink">typical_weather</strong> and re-evaluates every 30–90 simulated minutes from CSV cloud, rain, and humidity.</p>
            </Group>
            <Group title="PV & inverter">
              <Number label="Maximum array output" value={draft.site.maxPvW} unit="W" min={1} onChange={(value) => site('maxPvW', value)} />
              <Number label="PV harvest threshold" value={draft.site.pvThresholdW} unit="W" min={0} onChange={(value) => site('pvThresholdW', value)} />
              <Number label="Inverter rating" value={draft.site.maxInverterW} unit="W" min={1} onChange={(value) => site('maxInverterW', value)} />
              <Number label="Initial heatsink" value={draft.site.heatsinkC} unit="°C" onChange={(value) => site('heatsinkC', value)} />
            </Group>
            <Group title="Battery & grid">
              <Number label="Usable capacity" value={draft.site.batteryCapacityWh} unit="Wh" min={1} onChange={(value) => site('batteryCapacityWh', value)} />
              <Number label="Initial state of charge" value={draft.site.batterySocPercent} unit="%" min={0} max={100} onChange={(value) => site('batterySocPercent', value)} />
              <Number label="Nominal bank voltage" value={draft.site.batteryNominalV} unit="V" min={1} onChange={(value) => site('batteryNominalV', value)} />
              <Toggle label="State grid available" checked={draft.site.gridAvailable} onChange={(value) => site('gridAvailable', value)} />
            </Group>
          </div>
        </section>

        <section className="panel overflow-hidden">
          <Header icon={<Settings2 size={18} />} title="Editable backend KBS settings" subtitle="PATCH /api/kbs/settings/ · Python remains the only decision authority" />
          <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-5">
            <Number label="K cycle cadence" value={draft.settings.cycle_seconds} unit="real s" min={1} step={1} onChange={(value) => setDraft({ ...draft, settings: { ...draft.settings, cycle_seconds: value } })} />
            <Select label="Engine mode" value={draft.settings.mode} options={['active', 'observing']} onChange={(value) => setDraft({ ...draft, settings: { ...draft.settings, mode: value as 'active' | 'observing' } })} />
            <Select label="Data source" value={draft.settings.data_source} options={['simulator', 'real']} onChange={(value) => setDraft({ ...draft, settings: { ...draft.settings, data_source: value as 'simulator' | 'real' } })} />
            <Toggle label="Power saving" checked={draft.settings.power_saving} onChange={(value) => setDraft({ ...draft, settings: { ...draft.settings, power_saving: value } })} />
            <Number label="Battery floor" value={draft.settings.battery_low_voltage_V} unit="V" step={.1} onChange={(value) => setDraft({ ...draft, site: { ...draft.site, batteryFloorV: value }, settings: { ...draft.settings, battery_low_voltage_V: value } })} />
            <Number label="Low margin" value={draft.settings.battery_low_margin_V} unit="V" step={.1} onChange={(value) => setDraft({ ...draft, settings: { ...draft.settings, battery_low_margin_V: value } })} />
            <Number label="Shutdown buffer" value={draft.settings.battery_shutdown_buffer_percent} unit="%" step={.1} onChange={(value) => setDraft({ ...draft, settings: { ...draft.settings, battery_shutdown_buffer_percent: value } })} />
            <Number label="Joule deficit limit" value={draft.settings.joule_deficit_limit_J} unit="J" step={1000} onChange={(value) => setDraft({ ...draft, settings: { ...draft.settings, joule_deficit_limit_J: value } })} />
            <Number label="Grid present minimum" value={draft.settings.grid_present_min_V} unit="V" step={1} onChange={(value) => setDraft({ ...draft, settings: { ...draft.settings, grid_present_min_V: value } })} />
          </div>
        </section>

        <section className="panel overflow-hidden">
          <Header icon={<Settings2 size={18} />} title="Breaker physical model" subtitle="Definitions are preserved by history reset; relay state is controlled from the dashboard" />
          <div className="thin-scrollbar overflow-x-auto p-4">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="eyebrow"><tr><th className="p-2">Device</th><th>Priority</th><th>Degree</th><th>Load</th><th>Peak W</th><th>Normal W</th><th>Peak min</th><th>Online</th></tr></thead>
              <tbody>{draft.breakers.map((breaker, index) => {
                const update = (patch: Partial<typeof breaker>) => setDraft({ ...draft, breakers: draft.breakers.map((item, at) => at === index ? { ...item, ...patch } : item) })
                return <tr className="border-t border-outline" key={breaker.deviceId}>
                  <td className="p-2 font-mono">{breaker.deviceId}</td>
                  <td><select className="field-control !w-32" value={breaker.priorityType} onChange={(event) => update({ priorityType: event.target.value as typeof breaker.priorityType })}>{['mandatory', 'normal', 'comfort', 'ac_grid'].map((value) => <option key={value}>{value}</option>)}</select></td>
                  <td><input className="field-control !w-20" type="number" min="1" value={breaker.priorityDegree} onChange={(event) => update({ priorityDegree: globalThis.Number(event.target.value) })} /></td>
                  <td><select className="field-control !w-24" value={breaker.loadType} onChange={(event) => update({ loadType: event.target.value as typeof breaker.loadType })}>{['normal', 'motor'].map((value) => <option key={value}>{value}</option>)}</select></td>
                  <td><input className="field-control !w-24" type="number" min="0" value={breaker.peakW} onChange={(event) => update({ peakW: globalThis.Number(event.target.value) })} /></td>
                  <td><input className="field-control !w-24" type="number" min="0" value={breaker.normalW} onChange={(event) => update({ normalW: globalThis.Number(event.target.value) })} /></td>
                  <td><input className="field-control !w-20" type="number" min="0" value={breaker.peakMinutes} onChange={(event) => update({ peakMinutes: globalThis.Number(event.target.value) })} /></td>
                  <td><input aria-label={breaker.deviceId + ' online'} type="checkbox" checked={breaker.online} onChange={(event) => update({ online: event.target.checked })} /></td>
                </tr>
              })}</tbody>
            </table>
          </div>
        </section>

        <section className="panel overflow-hidden">
          <Header icon={<Database size={18} />} title="Read-only fact and rule branch reference" subtitle="Documentation of the real Python engines; no browser IF/THEN rule editor" />
          <div className="grid gap-4 p-4 md:grid-cols-2">
            <div><h3 className="eyebrow mb-2">Key facts supplied to Python</h3><Reference values={['pv_charging_power_W · load / inverter limits', 'battery_voltage_V · capacity · current', 'grid_voltage_V · breaker relay state', 'heatsink_temp_C · cumulative joule deficit', 'weather_condition (Tier-2 fact only)', 'breaker priority, schedule, lockout and event requirements']} /></div>
            <div><h3 className="eyebrow mb-2">Representative real-engine branches</h3><Reference values={['Tier-1: inverter_overheat / inverter_overload', 'Tier-1: battery_critical / battery_low / grid_outage', 'Tier-2: protect_inverter / protect_battery', 'Tier-2: day.surplus.* / day.deficit.*', 'Tier-2: day.sudden_drop.*', 'Tier-2: night.sudden_draw.* / night.normal']} /></div>
          </div>
        </section>

        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-outline bg-surface/95 py-3 backdrop-blur">
          <div className="flex gap-2"><button className="button-ghost" type="button" onClick={() => { resetConfiguration(); setStatus('Local defaults restored.') }}><RefreshCw size={15} /> Reset local defaults</button><span className="self-center text-xs text-muted" role="status">{status}</span></div>
          <button className="button-primary px-6" disabled={saving}><Save size={16} /> {saving ? 'Saving…' : 'Save & initialize'}</button>
        </div>
      </form>
    </div>
  )
}

function Header({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return <div className="panel-header flex items-center gap-3"><span className="text-primary">{icon}</span><div><h2 className="text-sm font-semibold">{title}</h2><p className="text-[10px] uppercase tracking-wider text-muted">{subtitle}</p></div></div>
}
function Group({ title, children }: { title: string; children: ReactNode }) { return <div className="space-y-3"><h3 className="eyebrow border-b border-outline pb-2">{title}</h3>{children}</div> }
function Text({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label><span className="field-label">{label}</span><input className="field-control" type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label> }
function Number({ label, value, onChange, unit, min, max, step = .01 }: { label: string; value: number; onChange: (value: number) => void; unit?: string; min?: number; max?: number; step?: number }) { return <label><span className="field-label">{label}</span><div className="relative"><input className="field-control pr-16 font-mono" type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(globalThis.Number(event.target.value))} />{unit && <span className="pointer-events-none absolute right-2 top-2 text-[10px] text-muted">{unit}</span>}</div></label> }
function Select({ label, value, options, onChange, disabled = false }: { label: string; value: string; options: string[]; onChange: (value: string) => void; disabled?: boolean }) { return <label><span className="field-label">{label}</span><select className="field-control" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option value={option} key={option}>{option.replaceAll('_', ' ')}</option>)}</select></label> }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex cursor-pointer items-center justify-between rounded border border-outline bg-surface-lowest p-3 text-xs"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label> }
function Reference({ values }: { values: string[] }) { return <ul className="space-y-2">{values.map((value) => <li className="rounded bg-surface-lowest p-2 font-mono text-xs text-muted" key={value}>{value}</li>)}</ul> }
