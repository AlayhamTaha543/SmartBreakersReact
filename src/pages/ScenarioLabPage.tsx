import { ArrowLeft, Battery, CheckCircle2, Circle, FlaskConical, Play, RotateCcw, Square, XCircle } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ThemeToggle } from '../components/ThemeToggle'
import { scenarios } from '../simulation/scenarios'
import type { ScenarioDefinition, SensorOverrides, WeatherCondition } from '../simulation/types'
import { useSimulator } from '../state/SimulatorContext'

const weatherOptions: WeatherCondition[] = ['sunny', 'partly_cloudy', 'cloudy', 'rainy', 'storm', 'foggy']

function batteryVoltageFor(definition: ScenarioDefinition) {
  const control = definition.batteryControl
  if (control?.source === 'event') {
    return definition.events[control.eventIndex ?? 0]?.changes.overrides?.batteryVoltageV
  }
  return definition.setup.overrides?.batteryVoltageV
}

export function ScenarioLabPage() {
  const {
    scenario, scenarioDefinition: definition, dashboard, selectScenario, loadScenario,
    startScenario, stopScenario, updateScenarioSetup, setScenarioBatteryVoltage,
  } = useSimulator()
  const [message, setMessage] = useState('')
  const loaded = scenario.loadedId === definition.id
  const batteryVoltage = batteryVoltageFor(definition)
  const setupDisabled = scenario.active
  const updateOverride = (key: keyof SensorOverrides, value: number | undefined) =>
    updateScenarioSetup({ overrides: { ...definition.setup.overrides, [key]: value } })
  const runClean = async () => {
    const confirmed = window.confirm('This clean scenario run will permanently clear telemetry, breaker readings, decisions/actions, alerts, countdowns, and lockouts for this simulator organization. Continue?')
    if (!confirmed) return
    setMessage('Resetting scoped backend history…')
    try { await startScenario(true); setMessage('Scenario running against the real local services.') }
    catch (error) { setMessage('Unable to start: ' + (error instanceof Error ? error.message : String(error))) }
  }
  const passed = scenario.completed && scenario.results.every((item) => item === 'pass')

  return (
    <div className="min-h-screen bg-surface text-ink">
      <header className="sticky top-0 z-30 border-b border-outline bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3">
          <Link className="flex items-center gap-2 text-primary" to="/"><ArrowLeft size={18} /> Dashboard</Link>
          <div className="text-center"><h1 className="flex items-center gap-2 font-semibold"><FlaskConical size={18} className="text-tertiary" /> Scenario Lab</h1><p className="text-[10px] uppercase text-muted">17 deterministic real-engine definitions</p></div>
          <div className="flex items-center gap-2"><ThemeToggle /><Link className="button-secondary" to="/configuration">Configuration</Link></div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1600px] gap-4 p-4 lg:grid-cols-[330px_1fr_390px]">
        <aside className="panel overflow-hidden">
          <div className="panel-header"><h2 className="eyebrow">Scenario catalog</h2><p className="mt-1 text-xs text-muted">6 Tier‑1 · 8 Tier‑2 · 3 integrated</p></div>
          <div className="thin-scrollbar max-h-[calc(100vh-150px)] overflow-y-auto p-2">
            {(['Tier-1', 'Tier-2', 'Integrated'] as const).map((tier) => <section key={tier}>
              <h3 className="sticky top-0 z-10 bg-surface-lowest px-2 py-2 text-[10px] font-bold uppercase text-muted">{tier}</h3>
              {scenarios.filter((item) => item.tier === tier).map((item) => (
                <button key={item.id} type="button" onClick={() => { selectScenario(item.id); setMessage('') }}
                  className={'mb-1 w-full rounded border p-3 text-left transition ' + (definition.id === item.id ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-surface-high')}>
                  <span className="block text-xs font-semibold">{item.name}</span>
                  <span className="mt-1 block font-mono text-[9px] text-muted">{item.durationRealS}s real · {item.events.length} disturbance{item.events.length === 1 ? '' : 's'}</span>
                </button>
              ))}
            </section>)}
          </div>
        </aside>

        <div className="grid min-w-0 content-start gap-4">
          <section className="panel overflow-hidden">
            <div className="panel-header flex flex-wrap items-center justify-between gap-3">
              <div><p className="eyebrow">{definition.tier} · {definition.id}</p><h2 className="mt-1 text-xl font-semibold">{definition.name}</h2></div>
              <span className={'rounded px-3 py-1 text-[10px] font-bold ' + (scenario.active ? 'bg-secondary/10 text-secondary' : scenario.completed ? (passed ? 'bg-secondary/10 text-secondary' : 'bg-danger/10 text-danger') : 'bg-surface-highest text-muted')}>
                {scenario.active ? 'RUNNING' : scenario.completed ? (passed ? 'PASS' : 'FAIL') : loaded ? 'LOADED' : 'PREVIEW'}
              </span>
            </div>
            <div className="p-4">
              <p className="text-sm leading-6 text-muted">{definition.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="button-secondary" type="button" disabled={scenario.active} onClick={() => { loadScenario(definition.id); setMessage('Edited setup applied. Backend history has not been reset.') }}><RotateCcw size={15} /> Apply setup</button>
                <button className="button-primary" type="button" disabled={!loaded || scenario.active} onClick={() => void runClean()}><Play size={15} /> Run clean</button>
                <button className="button-secondary" type="button" disabled={!scenario.active} onClick={stopScenario}><Square size={14} /> Stop</button>
              </div>
              <p className="mt-3 text-xs text-muted" role="status">{message}</p>
              <p className="mt-2 text-[10px] text-tertiary">“Run clean” always requires confirmation before the simulator-only backend reset.</p>
            </div>
          </section>

          <section className="panel p-4">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
              <div><h2 className="eyebrow">Editable setup</h2><p className="mt-1 text-xs text-muted">Changes are kept in this scenario draft. Select Apply setup before running.</p></div>
              {!loaded && <span className="rounded bg-warning/10 px-2 py-1 text-[10px] font-bold text-warning">APPLY REQUIRED</span>}
            </div>

            <SetupGroup title="Clock & engines">
              <TextField label="Date/time" type="datetime-local" value={definition.setup.localDateTime} disabled={setupDisabled || definition.dateLocked || definition.timeLocked} onChange={(value) => updateScenarioSetup({ localDateTime: value })} />
              <NumberField label="Clock scale" value={definition.setup.scale} unit="×" min={0.1} disabled={setupDisabled} onChange={(value) => updateScenarioSetup({ scale: value })} />
              <NumberField label="Telemetry cadence" value={definition.setup.pushIntervalS} unit="real s" min={0.1} disabled={setupDisabled} onChange={(value) => updateScenarioSetup({ pushIntervalS: value })} />
              <NumberField label="Tier-2 cycle" value={definition.setup.tier2CycleS} unit="real s" min={1} disabled={setupDisabled} onChange={(value) => updateScenarioSetup({ tier2CycleS: value })} />
              <ToggleField label="Tier-1 enabled" checked={definition.setup.tier1} disabled={setupDisabled} onChange={(value) => updateScenarioSetup({ tier1: value })} />
              <ToggleField label="Tier-2 enabled" checked={definition.setup.tier2} disabled={setupDisabled} onChange={(value) => updateScenarioSetup({ tier2: value })} />
            </SetupGroup>

            <SetupGroup title="Physical baseline">
              <SelectField label="Weather" value={definition.setup.manualWeather ?? 'sunny'} options={weatherOptions} disabled={setupDisabled} onChange={(value) => updateScenarioSetup({ manualWeather: value as WeatherCondition })} />
              <NumberField label="Maximum PV" value={definition.setup.maxPvW} unit="W" min={1} disabled={setupDisabled} onChange={(value) => updateScenarioSetup({ maxPvW: value })} />
              <NumberField label="PV threshold" value={definition.setup.pvThresholdW} unit="W" min={0} disabled={setupDisabled} onChange={(value) => updateScenarioSetup({ pvThresholdW: value })} />
              <NumberField label="Inverter rating" value={definition.setup.maxInverterW} unit="W" min={1} disabled={setupDisabled} onChange={(value) => updateScenarioSetup({ maxInverterW: value })} />
              <NumberField label="Battery capacity" value={definition.setup.batteryCapacityWh} unit="Wh" min={1} disabled={setupDisabled} onChange={(value) => updateScenarioSetup({ batteryCapacityWh: value })} />
              <NumberField label="Battery SOC" value={definition.setup.batterySocPercent} unit="%" min={0} max={100} disabled={setupDisabled} onChange={(value) => updateScenarioSetup({ batterySocPercent: value })} />
              <NumberField label="Nominal voltage" value={definition.setup.batteryNominalV} unit="V" min={1} disabled={setupDisabled} onChange={(value) => updateScenarioSetup({ batteryNominalV: value })} />
              <NumberField label="Battery floor" value={definition.setup.batteryFloorV} unit="V" min={1} disabled={setupDisabled} onChange={(value) => updateScenarioSetup({ batteryFloorV: value })} />
              <ToggleField label="Grid available" checked={definition.setup.gridAvailable ?? true} disabled={setupDisabled} onChange={(value) => updateScenarioSetup({ gridAvailable: value })} />
              <ToggleField label="Power saving" checked={definition.setup.powerSaving} disabled={setupDisabled} onChange={(value) => updateScenarioSetup({ powerSaving: value })} />
              <ToggleField label="Backend fault" checked={definition.setup.backendOffline ?? false} disabled={setupDisabled} onChange={(value) => updateScenarioSetup({ backendOffline: value })} />
            </SetupGroup>

            <SetupGroup title="Sensor overrides · leave blank to use the physical model">
              <OptionalNumberField label="PV override" value={definition.setup.overrides?.pvW} unit="W" min={0} disabled={setupDisabled} onChange={(value) => updateOverride('pvW', value)} />
              <OptionalNumberField label="Heatsink override" value={definition.setup.overrides?.heatsinkC} unit="°C" disabled={setupDisabled} onChange={(value) => updateOverride('heatsinkC', value)} />
              {!definition.batteryControl && <OptionalNumberField label="Battery voltage override" value={batteryVoltage} unit="V" min={0} disabled={setupDisabled} onChange={setScenarioBatteryVoltage} />}
              <OptionalNumberField label="Charge current" value={definition.setup.overrides?.batteryChargeCurrentA} unit="A" min={0} disabled={setupDisabled} onChange={(value) => updateOverride('batteryChargeCurrentA', value)} />
              <OptionalNumberField label="Discharge current" value={definition.setup.overrides?.batteryDischargeCurrentA} unit="A" min={0} disabled={setupDisabled} onChange={(value) => updateOverride('batteryDischargeCurrentA', value)} />
              <OptionalNumberField label="Grid voltage" value={definition.setup.overrides?.gridVoltageV} unit="V" min={0} disabled={setupDisabled} onChange={(value) => updateOverride('gridVoltageV', value)} />
            </SetupGroup>

            {definition.batteryControl && (
              <div className="mt-4 rounded border border-secondary/40 bg-secondary/[.04] p-4">
                <div className="flex gap-3"><Battery className="shrink-0 text-secondary" /><div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-semibold">{definition.batteryControl.label}</h3><p className="mt-1 text-xs text-muted">{definition.batteryControl.note}</p></div><output className="rounded bg-surface-lowest px-3 py-2 font-mono text-sm font-semibold text-secondary" aria-live="polite">{batteryVoltage === undefined ? 'Physical model' : batteryVoltage + ' V'}</output></div>
                  <div className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_150px]">
                    <label><span className="field-label">Battery voltage slider</span><input aria-label={definition.batteryControl.label + ' slider'} className="field-control" type="range" min={definition.batteryControl.min} max={definition.batteryControl.max} step={definition.batteryControl.step} value={batteryVoltage ?? definition.batteryControl.min} disabled={setupDisabled} onChange={(event) => setScenarioBatteryVoltage(Number(event.target.value))} /></label>
                    <OptionalNumberField label={definition.batteryControl.label} value={batteryVoltage} unit="V" min={definition.batteryControl.min} max={definition.batteryControl.max} step={definition.batteryControl.step} disabled={setupDisabled} onChange={setScenarioBatteryVoltage} />
                  </div>
                </div></div>
              </div>
            )}
          </section>

          <section className="panel p-4">
            <h2 className="eyebrow mb-3">Run state</h2>
            <dl className="grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
              <Stat label="Phase" value={scenario.phase} />
              <Stat label="Elapsed" value={scenario.elapsedRealS.toFixed(1) + ' / ' + definition.durationRealS + 's'} />
              <Stat label="Simulated clock" value={new Date(dashboard.simMs).toLocaleString()} />
              <Stat label="Next event" value={String(scenario.nextEventIndex + 1) + ' / ' + definition.events.length} />
              <Stat label="Tier-1" value={dashboard.tier1.enabled ? dashboard.tier1.status : 'disabled'} />
              <Stat label="Tier-2" value={dashboard.tier2.enabled ? dashboard.tier2.status : 'disabled'} />
            </dl>
          </section>

          <section className="panel overflow-hidden">
            <div className="panel-header"><h2 className="eyebrow">Injected disturbances</h2></div>
            <div className="divide-y divide-outline">
              {!definition.events.length && <p className="p-4 text-xs text-muted">No disturbance; the scenario observes healthy baseline behavior.</p>}
              {definition.events.map((event, index) => <article className="flex gap-4 p-4" key={event.atSimS + event.label}><span className={'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ' + (scenario.nextEventIndex > index ? 'bg-secondary text-[#002016]' : 'bg-surface-highest text-muted')}>{index + 1}</span><div><p className="text-sm font-semibold">{event.phase} · +{event.atSimS}s simulated</p><p className="mt-1 text-xs text-muted">{event.label}</p></div></article>)}
            </div>
          </section>

          <section className="panel overflow-hidden">
            <div className="panel-header"><h2 className="eyebrow">Scenario timeline</h2></div>
            <div className="thin-scrollbar max-h-52 overflow-y-auto divide-y divide-outline">{scenario.log.length ? scenario.log.map((entry, index) => <div className="p-3 text-xs" key={entry.timestamp + index}><time className="mr-3 font-mono text-[9px] text-muted">{new Date(entry.timestamp).toLocaleTimeString()}</time>{entry.message}</div>) : <p className="p-4 text-xs text-muted">Apply a scenario setup to start its timeline.</p>}</div>
          </section>
        </div>

        <aside className="grid min-w-0 content-start gap-4">
          <section className="panel overflow-hidden">
            <div className="panel-header"><h2 className="eyebrow">Declared expectations</h2></div>
            <div className="divide-y divide-outline">
              {definition.expectations.map((expectation, index) => {
                const result = loaded ? (scenario.results[index] ?? 'pending') : 'pending'
                const Icon = result === 'pass' ? CheckCircle2 : result === 'fail' ? XCircle : Circle
                return <div className="flex gap-3 p-3 text-xs" key={expectation.label}><Icon className={result === 'pass' ? 'text-secondary' : result === 'fail' ? 'text-danger' : 'text-muted'} size={17} /><div><p>{expectation.label}</p><p className={'mt-1 font-mono text-[9px] uppercase ' + (result === 'pass' ? 'text-secondary' : result === 'fail' ? 'text-danger' : 'text-muted')}>{result}</p></div></div>
              })}
            </div>
          </section>
          <section className="panel p-4">
            <h2 className="eyebrow mb-3">Actual observations</h2>
            <div className="grid grid-cols-2 gap-2">
              <Count label="T1 evaluations" value={scenario.observations.tier1Evaluations} />
              <Count label="T1 situations" value={scenario.observations.tier1Situations.length} />
              <Count label="T1 commands" value={scenario.observations.tier1Commands.length} />
              <Count label="T2 branches" value={scenario.observations.tier2Branches.length} />
              <Count label="T2 received" value={scenario.observations.tier2ActionsReceived.length} />
              <Count label="T2 applied" value={scenario.observations.tier2ActionsApplied.length} />
              <Count label="T2 blocked" value={scenario.observations.tier2ActionsBlocked.length} />
              <Count label="Backend errors" value={scenario.observations.backendErrors.length} />
            </div>
            {scenario.observations.tier1Situations.length > 0 && <p className="mt-3 break-words font-mono text-[10px] text-tertiary">T1: {scenario.observations.tier1Situations.join(', ')}</p>}
            {scenario.observations.tier2Branches.length > 0 && <p className="mt-2 break-words font-mono text-[10px] text-primary">T2: {scenario.observations.tier2Branches.join(', ')}</p>}
          </section>
        </aside>
      </main>
    </div>
  )
}

function SetupGroup({ title, children }: { title: string; children: ReactNode }) {
  return <fieldset className="mt-4 border-t border-outline pt-3"><legend className="eyebrow pr-3">{title}</legend><div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div></fieldset>
}
function TextField({ label, value, onChange, type = 'text', disabled = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean }) {
  return <label><span className="field-label">{label}</span><input className="field-control" type={type} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>
}
function NumberField({ label, value, onChange, unit, min, max, step = .01, disabled = false }: { label: string; value: number | undefined; onChange: (value: number) => void; unit?: string; min?: number; max?: number; step?: number; disabled?: boolean }) {
  const [draft, setDraft] = useState(() => value === undefined ? '' : String(value))
  useEffect(() => setDraft(value === undefined ? '' : String(value)), [value])
  return <label><span className="field-label">{label}</span><div className="relative"><input
    className="field-control pr-16 font-mono" type="number" value={draft}
    min={min} max={max} step={step} disabled={disabled}
    onChange={(event) => {
      setDraft(event.target.value)
      if (event.target.value !== '') onChange(Number(event.target.value))
    }}
    onBlur={() => { if (draft === '') setDraft(value === undefined ? '' : String(value)) }}
  />{unit && <span className="pointer-events-none absolute right-2 top-2 text-[10px] text-muted">{unit}</span>}</div></label>
}
function OptionalNumberField({ label, value, onChange, unit, min, max, step = .01, disabled = false }: { label: string; value: number | undefined; onChange: (value: number | undefined) => void; unit?: string; min?: number; max?: number; step?: number; disabled?: boolean }) {
  return <label><span className="field-label">{label}</span><div className="relative"><input className="field-control pr-16 font-mono" type="number" value={value ?? ''} placeholder="Physical" min={min} max={max} step={step} disabled={disabled} onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))} />{unit && <span className="pointer-events-none absolute right-2 top-2 text-[10px] text-muted">{unit}</span>}</div></label>
}
function SelectField({ label, value, options, onChange, disabled = false }: { label: string; value: string; options: string[]; onChange: (value: string) => void; disabled?: boolean }) {
  return <label><span className="field-label">{label}</span><select className="field-control" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option value={option} key={option}>{option.replaceAll('_', ' ')}</option>)}</select></label>
}
function ToggleField({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <label className="flex cursor-pointer items-center justify-between rounded border border-outline bg-surface-lowest p-3 text-xs"><span>{label}</span><input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /></label>
}
function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded bg-surface-lowest p-2"><dt className="text-[9px] font-bold uppercase text-muted">{label}</dt><dd className="mt-1 break-words font-mono text-[10px]">{value}</dd></div> }
function Count({ label, value }: { label: string; value: number }) { return <div className="rounded bg-surface-lowest p-2 text-center"><strong className="block font-mono text-lg">{value}</strong><span className="text-[9px] uppercase text-muted">{label}</span></div> }
