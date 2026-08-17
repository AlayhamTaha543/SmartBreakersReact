import {
  Battery, CheckCircle2, Circle, FlaskConical, ListFilter, Play, RotateCcw,
  Search, Square, X, XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { FuzzyDecisionFlow } from '../components/FuzzyDecisionFlow'
import { PageTabs } from '../components/PageTabs'
import { cycleTiming } from '../simulation/cycleTiming'
import { scenarios } from '../simulation/scenarios'
import type {
  FuzzyDecisionCycle, ScenarioDefinition, ScenarioMetrics, SensorOverrides,
  Tier2Policy, WeatherCondition,
} from '../simulation/types'
import { useSimulator } from '../state/SimulatorContext'

const weatherOptions: WeatherCondition[] = ['sunny', 'partly_cloudy', 'cloudy', 'rainy', 'storm', 'foggy']
const metricRows: Array<{ key: keyof ScenarioMetrics; label: string; unit: string }> = [
  { key: 'gridImportWh', label: 'Grid import', unit: 'Wh' },
  { key: 'minimumBatterySocPercent', label: 'Minimum battery SOC', unit: '%' },
  { key: 'timeBelowReserveS', label: 'Time below reserve', unit: 'sim s' },
  { key: 'optionalLoadServedWh', label: 'Optional-load service', unit: 'Wh' },
  { key: 'mandatoryOffCommands', label: 'Mandatory OFF commands', unit: '' },
  { key: 'actionCount', label: 'Action count', unit: '' },
  { key: 'commandReversals', label: 'Command reversals', unit: '' },
]
const scenarioViews = ['setup', 'run', 'evidence', 'compare'] as const
type ScenarioView = typeof scenarioViews[number]
type TierFilter = 'All' | ScenarioDefinition['tier']

function batteryVoltageFor(definition: ScenarioDefinition) {
  const control = definition.batteryControl
  if (control?.source === 'event') {
    return definition.events[control.eventIndex ?? 0]?.changes.overrides?.batteryVoltageV
  }
  return definition.setup.overrides?.batteryVoltageV
}

function ScenarioFuzzyCycleHistory({ cycles, policy }: { cycles: FuzzyDecisionCycle[]; policy: Tier2Policy }) {
  const latestDecisionId = cycles.at(-1)?.decisionId ?? null
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(latestDecisionId)

  useEffect(() => setSelectedDecisionId(latestDecisionId), [cycles.length, latestDecisionId])

  const newestFirst = [...cycles].reverse()
  const selectedCycle = cycles.find((cycle) => cycle.decisionId === selectedDecisionId) ?? newestFirst[0] ?? null
  const selectedNumber = selectedCycle
    ? cycles.findIndex((cycle) => cycle.decisionId === selectedCycle.decisionId) + 1
    : null

  return <div className="grid gap-4">
    <section className="panel p-4" aria-label="Current-run fuzzy cycle history">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="eyebrow">Current-run fuzzy cycles</h2><p className="mt-1 text-xs text-muted">Newest first · select a decision to inspect its complete path.</p></div>
        <span className="event-badge border-primary/30 bg-primary/10 text-primary">{cycles.length} captured</span>
      </div>
      {newestFirst.length > 0
        ? <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Select fuzzy decision cycle">
          {newestFirst.map((cycle) => {
            const cycleNumber = cycles.findIndex((item) => item.decisionId === cycle.decisionId) + 1
            const selected = cycle.decisionId === selectedCycle?.decisionId
            return <button key={cycle.decisionId} type="button" aria-pressed={selected} className={selected ? 'button-primary' : 'button-secondary'} onClick={() => setSelectedDecisionId(cycle.decisionId)}>Cycle {cycleNumber}</button>
          })}
        </div>
        : <p className="mt-3 text-xs text-muted">No fuzzy cycle has been captured in this run.</p>}
    </section>
    <FuzzyDecisionFlow cycle={selectedCycle} policy={policy} title={selectedNumber == null ? 'Fuzzy decision cycle' : 'Fuzzy decision cycle ' + selectedNumber} />
  </div>
}

function ScenarioCatalog({
  selectedId,
  query,
  onQueryChange,
  tier,
  onTierChange,
  onSelect,
}: {
  selectedId: string
  query: string
  onQueryChange: (value: string) => void
  tier: TierFilter
  onTierChange: (value: TierFilter) => void
  onSelect: (id: string) => void
}) {
  const normalized = query.trim().toLowerCase()
  const filtered = useMemo(() => scenarios.filter((item) =>
    (tier === 'All' || item.tier === tier)
    && (!normalized || item.name.toLowerCase().includes(normalized) || item.id.toLowerCase().includes(normalized))),
  [normalized, tier])

  return <div className="panel overflow-hidden">
    <div className="panel-header">
      <h2 className="text-sm font-semibold">Scenario catalog</h2>
      <p className="mt-1 text-[11px] text-muted">Find a deterministic real-engine definition.</p>
    </div>
    <div className="grid gap-3 border-b border-outline p-3">
      <label><span className="field-label">Search scenarios</span><span className="relative block"><Search className="pointer-events-none absolute left-3 top-3 text-muted" size={16} /><input className="field-control pl-10" type="search" value={query} placeholder="Name or scenario ID" onChange={(event) => onQueryChange(event.target.value)} /></span></label>
      <label><span className="field-label">Tier filter</span><span className="relative block"><ListFilter className="pointer-events-none absolute left-3 top-3 text-muted" size={16} /><select className="field-control pl-10" value={tier} onChange={(event) => onTierChange(event.target.value as TierFilter)}><option>All</option><option>Tier-1</option><option>Tier-2</option><option>Integrated</option></select></span></label>
    </div>
    <div className="thin-scrollbar max-h-[calc(100dvh-360px)] min-h-48 overflow-y-auto p-2">
      {(['Tier-1', 'Tier-2', 'Integrated'] as const).map((group) => {
        const groupItems = filtered.filter((item) => item.tier === group)
        if (!groupItems.length) return null
        return <section key={group}>
          <h3 className="sticky top-0 z-10 bg-surface-lowest px-2 py-2 text-[11px] font-bold uppercase tracking-wider text-muted">{group}</h3>
          {groupItems.map((item) => <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={'relative mb-1 w-full overflow-hidden rounded-lg border p-3 pl-4 text-left transition hover:bg-surface-high ' + (selectedId === item.id ? 'border-primary/50 bg-primary/[.08] shadow-sm' : 'border-transparent')}
          >
            {selectedId === item.id && <span className="absolute inset-y-2 left-0 w-1 rounded-r bg-primary-strong" />}
            <span className="flex items-start justify-between gap-2"><span className={'text-xs font-semibold leading-5 ' + (selectedId === item.id ? 'text-primary' : 'text-ink')}>{item.name}</span>{selectedId === item.id && <span className="event-badge shrink-0 border-primary/30 bg-primary/10 text-primary">Selected</span>}</span>
            <span className="mt-1 block font-mono text-[11px] leading-4 text-muted">{item.durationRealS}s real · {item.events.length} disturbance{item.events.length === 1 ? '' : 's'}</span>
          </button>)}
        </section>
      })}
      {!filtered.length && <p className="rounded-lg border border-dashed border-outline p-4 text-center text-xs text-muted">No scenarios match the current filters.</p>}
    </div>
  </div>
}

export function ScenarioLabPage() {
  const {
    scenario, scenarioDefinition: definition, dashboard, comparison,
    selectScenario, loadScenario, startScenario, runScenarioComparison,
    stopScenario, updateScenarioSetup, setScenarioBatteryVoltage,
  } = useSimulator()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedView = searchParams.get('view')
  const view: ScenarioView = scenarioViews.includes(requestedView as ScenarioView) ? requestedView as ScenarioView : 'setup'
  const [message, setMessage] = useState('')
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [catalogQuery, setCatalogQuery] = useState('')
  const [tierFilter, setTierFilter] = useState<TierFilter>('All')
  const drawerRef = useRef<HTMLDivElement>(null)

  const loaded = scenario.loadedId === definition.id
  const batteryVoltage = batteryVoltageFor(definition)
  const setupDisabled = scenario.active
  const comparisonBusy = comparison.status === 'running_crisp' || comparison.status === 'running_fuzzy'
  const timing = cycleTiming(definition.setup.tier2CycleS, definition.setup.scale ?? 60)
  const passed = scenario.completed && scenario.results.every((item) => item === 'pass')
  const progress = Math.min(100, scenario.completed ? 100 : scenario.elapsedRealS / definition.durationRealS * 100)
  const tierCounts = scenarios.filter((item) => item.tier === 'Tier-1').length + ' Tier‑1 · '
    + scenarios.filter((item) => item.tier === 'Tier-2').length + ' Tier‑2 · '
    + scenarios.filter((item) => item.tier === 'Integrated').length + ' integrated'

  useEffect(() => {
    if (!catalogOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    drawerRef.current?.focus()
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCatalogOpen(false)
    }
    document.addEventListener('keydown', escape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', escape)
    }
  }, [catalogOpen])

  const changeView = (next: ScenarioView) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('view', next)
    setSearchParams(nextParams)
  }
  const chooseScenario = (id: string) => {
    selectScenario(id)
    setMessage('')
    setCatalogOpen(false)
  }
  const updateOverride = (key: keyof SensorOverrides, value: number | undefined) =>
    updateScenarioSetup({ overrides: { ...definition.setup.overrides, [key]: value } })
  const runClean = async () => {
    const confirmed = window.confirm('This clean scenario run will permanently clear telemetry, breaker readings, decisions/actions, alerts, countdowns, and lockouts for this simulator organization. Continue?')
    if (!confirmed) return
    setMessage('Resetting scoped backend history…')
    changeView('run')
    try {
      await startScenario(true)
      setMessage('Scenario running against the real local services.')
    } catch (error) {
      setMessage('Unable to start: ' + (error instanceof Error ? error.message : String(error)))
    }
  }
  const runComparison = async () => {
    const confirmed = window.confirm('This A/B comparison will reset the scoped simulator backend before the crisp run and again before the fuzzy-active run. Continue?')
    if (!confirmed) return
    changeView('compare')
    setMessage('Running crisp baseline, then fuzzy active with a fresh backend state…')
    try {
      await runScenarioComparison()
      setMessage('Crisp versus fuzzy comparison complete.')
    } catch (error) {
      setMessage('Unable to compare: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  return <AppShell title="Scenario Lab" subtitle={scenarios.length + ' deterministic real-engine definitions · repeatable setup, execution, evidence, and comparison'}>
    <main className="mx-auto grid max-w-[1800px] gap-4 p-3 sm:p-4">
      <section className="panel overflow-hidden">
        <div className="panel-header flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><p className="eyebrow">{definition.tier} · {definition.id}</p><h2 className="mt-1 break-words text-xl font-semibold">{definition.name}</h2><p className="mt-1 text-[11px] text-muted">{tierCounts}</p></div>
          <span className={'event-badge px-3 py-1.5 ' + (scenario.active ? 'border-secondary/30 bg-secondary/10 text-secondary' : scenario.completed ? (passed ? 'border-secondary/30 bg-secondary/10 text-secondary' : 'border-danger/30 bg-danger/10 text-danger') : loaded ? 'border-primary/30 bg-primary/10 text-primary' : 'border-outline bg-surface-high text-muted')}>
            <span className={'mr-2 h-1.5 w-1.5 rounded-full ' + (scenario.active ? 'animate-pulse-soft bg-secondary' : scenario.completed ? (passed ? 'bg-secondary' : 'bg-danger') : loaded ? 'bg-primary' : 'bg-muted')} />{scenario.active ? 'RUNNING' : scenario.completed ? (passed ? 'PASS' : 'FAIL') : loaded ? 'LOADED' : 'PREVIEW'}
          </span>
        </div>
        <div className="p-4">
          <p className="max-w-5xl text-sm leading-6 text-muted">{definition.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="button-secondary min-h-11 sm:min-h-0" type="button" disabled={scenario.active} onClick={() => { loadScenario(definition.id); setMessage('Edited setup applied. Backend history has not been reset.') }}><RotateCcw size={15} /> Apply setup</button>
            <button className="button-primary min-h-11 sm:min-h-0" type="button" disabled={!loaded || scenario.active} onClick={() => void runClean()}><Play size={15} /> Run clean</button>
            <button className="button-secondary min-h-11 sm:min-h-0" type="button" disabled={!loaded || scenario.active || comparisonBusy || !definition.setup.tier2} onClick={() => void runComparison()}><FlaskConical size={15} /> Compare crisp vs fuzzy</button>
            <button className="button-secondary min-h-11 sm:min-h-0" type="button" disabled={!scenario.active} onClick={stopScenario}><Square size={14} /> Stop</button>
          </div>
          {message && <div className="event-card mt-3 p-3 text-xs" data-tone={message.startsWith('Unable') ? 'danger' : scenario.active ? 'success' : 'primary'} role="status" aria-live="polite"><strong>Status update</strong><p className="mt-1 leading-5 text-muted">{message}</p></div>}
          <p className="mt-3 text-[11px] leading-4 text-tertiary">“Run clean” always requires confirmation before the simulator-only backend reset.</p>
        </div>
      </section>

      <section className="panel sticky top-[109px] z-20 overflow-hidden">
        <PageTabs
          label="Scenario workflow"
          value={view}
          onChange={changeView}
          tabs={[
            { value: 'setup', label: 'Catalog & Setup' },
            { value: 'run', label: 'Run', badge: Math.round(progress) + '%' },
            { value: 'evidence', label: 'Evidence', badge: scenario.observations.fuzzyCycles.length },
            { value: 'compare', label: 'Compare' },
          ]}
        />
      </section>

      <section id="panel-setup" role="tabpanel" aria-labelledby="tab-setup" hidden={view !== 'setup'}>
        <div className="scenario-setup-layout">
          <aside className="hidden self-start lg:sticky lg:top-[174px] lg:block">
            <ScenarioCatalog selectedId={definition.id} query={catalogQuery} onQueryChange={setCatalogQuery} tier={tierFilter} onTierChange={setTierFilter} onSelect={chooseScenario} />
          </aside>
          <div className="grid min-w-0 gap-4">
            <button className="button-secondary min-h-12 w-full justify-between lg:hidden" type="button" onClick={() => setCatalogOpen(true)}><span className="text-left"><strong className="block">Choose scenario</strong><small className="mt-0.5 block normal-case tracking-normal text-muted">{'Selected · ' + definition.name}</small></span><ListFilter size={18} /></button>
            <section className="panel p-4">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div><h2 className="text-sm font-semibold">Editable setup</h2><p className="mt-1 text-xs text-muted">Changes stay in this scenario draft until Apply setup is selected.</p></div>
                {!loaded && <span className="event-badge border-warning/30 bg-warning/10 text-warning">Apply required</span>}
              </div>

              <SetupGroup title="Clock & engines">
                <TextField label="Date/time" type="datetime-local" value={definition.setup.localDateTime} disabled={setupDisabled || definition.dateLocked || definition.timeLocked} onChange={(value) => updateScenarioSetup({ localDateTime: value })} />
                <NumberField label="Clock scale" value={definition.setup.scale} unit="×" min={0.1} disabled={setupDisabled} onChange={(value) => updateScenarioSetup({ scale: value })} />
                <NumberField label="Telemetry cadence" value={definition.setup.pushIntervalS} unit="real s" min={0.1} disabled={setupDisabled} onChange={(value) => updateScenarioSetup({ pushIntervalS: value })} />
                <NumberField label="Tier-2 cycle" value={definition.setup.tier2CycleS} unit="real s" min={1} disabled={setupDisabled} onChange={(value) => updateScenarioSetup({ tier2CycleS: value })} />
                <SelectField label="Tier-2 policy" value={definition.setup.tier2Policy ?? 'crisp'} options={['crisp', 'fuzzy_shadow', 'fuzzy_active']} disabled={setupDisabled} onChange={(value) => updateScenarioSetup({ tier2Policy: value as Tier2Policy })} />
                <ToggleField label="Tier-1 enabled" checked={definition.setup.tier1} disabled={setupDisabled} onChange={(value) => updateScenarioSetup({ tier1: value })} />
                <ToggleField label="Tier-2 enabled" checked={definition.setup.tier2} disabled={setupDisabled} onChange={(value) => updateScenarioSetup({ tier2: value })} />
              </SetupGroup>
              <p className="mt-3 rounded-md border border-primary/20 bg-primary/[.04] p-3 text-xs leading-5 text-muted">
                Every {timing.realSecondsPerCycle}s real advances {timing.simulatedMinutesPerCycle.toFixed(1)} simulated minutes. Two-cycle confirmation is {timing.twoCycleRealSeconds}s real / {timing.twoCycleSimulatedMinutes.toFixed(1)} simulated minutes; severe risk and hard safety do not wait.
              </p>

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

              <SetupGroup title="Sensor overrides · blank uses the physical model">
                <OptionalNumberField label="PV override" value={definition.setup.overrides?.pvW} unit="W" min={0} disabled={setupDisabled} onChange={(value) => updateOverride('pvW', value)} />
                <OptionalNumberField label="Heatsink override" value={definition.setup.overrides?.heatsinkC} unit="°C" disabled={setupDisabled} onChange={(value) => updateOverride('heatsinkC', value)} />
                {!definition.batteryControl && <OptionalNumberField label="Battery voltage override" value={batteryVoltage} unit="V" min={0} disabled={setupDisabled} onChange={setScenarioBatteryVoltage} />}
                <OptionalNumberField label="Charge current" value={definition.setup.overrides?.batteryChargeCurrentA} unit="A" min={0} disabled={setupDisabled} onChange={(value) => updateOverride('batteryChargeCurrentA', value)} />
                <OptionalNumberField label="Discharge current" value={definition.setup.overrides?.batteryDischargeCurrentA} unit="A" min={0} disabled={setupDisabled} onChange={(value) => updateOverride('batteryDischargeCurrentA', value)} />
                <OptionalNumberField label="Grid voltage" value={definition.setup.overrides?.gridVoltageV} unit="V" min={0} disabled={setupDisabled} onChange={(value) => updateOverride('gridVoltageV', value)} />
              </SetupGroup>

              {definition.batteryControl && <div className="mt-4 rounded-lg border border-secondary/40 bg-secondary/[.04] p-4">
                <div className="flex gap-3"><Battery className="shrink-0 text-secondary" /><div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-semibold">{definition.batteryControl.label}</h3><p className="mt-1 text-xs leading-5 text-muted">{definition.batteryControl.note}</p></div><output className="rounded bg-surface-lowest px-3 py-2 font-mono text-sm font-semibold text-secondary" aria-live="polite">{batteryVoltage === undefined ? 'Physical model' : batteryVoltage + ' V'}</output></div>
                  <div className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_150px]">
                    <label><span className="field-label">Battery voltage slider</span><input aria-label={definition.batteryControl.label + ' slider'} className="field-control" type="range" min={definition.batteryControl.min} max={definition.batteryControl.max} step={definition.batteryControl.step} value={batteryVoltage ?? definition.batteryControl.min} disabled={setupDisabled} onChange={(event) => setScenarioBatteryVoltage(Number(event.target.value))} /></label>
                    <OptionalNumberField label={definition.batteryControl.label} value={batteryVoltage} unit="V" min={definition.batteryControl.min} max={definition.batteryControl.max} step={definition.batteryControl.step} disabled={setupDisabled} onChange={setScenarioBatteryVoltage} />
                  </div>
                </div></div>
              </div>}
            </section>
          </div>
        </div>
      </section>

      <section id="panel-run" role="tabpanel" aria-labelledby="tab-run" hidden={view !== 'run'} className="scenario-run-layout">
        <div className="grid min-w-0 gap-4">
          <RunState progress={progress} passed={passed} definition={definition} />
          <Disturbances definition={definition} />
          <Timeline />
        </div>
        <aside className="grid content-start gap-4">
          <Expectations definition={definition} loaded={loaded} />
          <section className="panel p-4">
            <h2 className="eyebrow">Run guidance</h2>
            <p className="mt-2 text-xs leading-5 text-muted">{scenario.active ? 'The simulator is executing the selected definition. Use Stop to end it without clearing the current evidence.' : loaded ? 'The setup is loaded and ready for a clean run.' : 'Return to Catalog & Setup and apply the selected definition before running.'}</p>
          </section>
        </aside>
      </section>

      <section id="panel-evidence" role="tabpanel" aria-labelledby="tab-evidence" hidden={view !== 'evidence'} className="scenario-evidence-layout">
        <ScenarioFuzzyCycleHistory cycles={scenario.observations.fuzzyCycles} policy={definition.setup.tier2Policy ?? 'crisp'} />
        <aside className="grid content-start gap-4">
          <Observations />
          <Expectations definition={definition} loaded={loaded} />
        </aside>
      </section>

      <section id="panel-compare" role="tabpanel" aria-labelledby="tab-compare" hidden={view !== 'compare'}>
        <ComparisonPanel />
      </section>
    </main>

    {catalogOpen && <div className="fixed inset-0 z-50 lg:hidden">
      <button className="absolute inset-0 bg-black/70" type="button" aria-label="Close scenario catalog" onClick={() => setCatalogOpen(false)} />
      <div ref={drawerRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="scenario-catalog-title" className="absolute inset-y-0 left-0 w-[min(92vw,390px)] overflow-y-auto bg-surface p-3 shadow-2xl outline-none">
        <div className="mb-3 flex items-center justify-between gap-3"><h2 id="scenario-catalog-title" className="text-base font-semibold">Choose a scenario</h2><button className="icon-button border border-outline bg-surface-high" type="button" aria-label="Close scenario catalog" onClick={() => setCatalogOpen(false)}><X size={19} /></button></div>
        <ScenarioCatalog selectedId={definition.id} query={catalogQuery} onQueryChange={setCatalogQuery} tier={tierFilter} onTierChange={setTierFilter} onSelect={chooseScenario} />
      </div>
    </div>}
  </AppShell>

  function RunState({ progress: currentProgress, passed: runPassed, definition: currentDefinition }: { progress: number; passed: boolean; definition: ScenarioDefinition }) {
    return <section className="panel p-4">
      <div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-semibold">Run state</h2><p className="mt-1 text-[11px] text-muted">Live execution progress and engine state</p></div><span className="font-mono text-sm text-primary">{currentProgress.toFixed(0)}%</span></div>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-surface-highest" aria-label={'Scenario progress ' + currentProgress.toFixed(0) + '%'} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(currentProgress)}><div className={'h-full rounded-full transition-[width] duration-500 ' + (scenario.completed && !runPassed ? 'bg-danger' : 'bg-gradient-to-r from-primary-strong to-secondary')} style={{ width: currentProgress + '%' }} /></div>
      <dl className="grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
        <Stat label="Phase" value={scenario.phase} tone={scenario.active ? 'success' : undefined} />
        <Stat label="Elapsed" value={scenario.elapsedRealS.toFixed(1) + ' / ' + currentDefinition.durationRealS + 's'} />
        <Stat label="Simulated clock" value={new Date(dashboard.simMs).toLocaleString()} />
        <Stat label="Next event" value={currentDefinition.events.length ? String(Math.min(scenario.nextEventIndex + 1, currentDefinition.events.length)) + ' / ' + currentDefinition.events.length : 'None'} tone={scenario.active && scenario.nextEventIndex < currentDefinition.events.length ? 'warning' : undefined} />
        <Stat label="Tier-1" value={dashboard.tier1.enabled ? dashboard.tier1.status : 'disabled'} tone={dashboard.tier1.enabled ? 'primary' : undefined} />
        <Stat label="Tier-2" value={dashboard.tier2.enabled ? dashboard.tier2.status : 'disabled'} tone={dashboard.tier2.enabled ? 'primary' : undefined} />
      </dl>
    </section>
  }

  function Disturbances({ definition: currentDefinition }: { definition: ScenarioDefinition }) {
    return <section className="panel overflow-hidden">
      <div className="panel-header flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Injected disturbances</h2><p className="mt-1 text-[11px] text-muted">Completed, next, and scheduled events</p></div><span className="event-badge border-warning/30 bg-warning/10 text-warning">{currentDefinition.events.length} scheduled</span></div>
      <div className="space-y-2 p-3">
        {!currentDefinition.events.length && <div className="rounded-lg border border-secondary/20 bg-secondary/[.05] p-4 text-xs"><p className="font-semibold text-secondary">Healthy baseline</p><p className="mt-1 text-muted">No disturbance; the scenario observes normal behavior.</p></div>}
        {currentDefinition.events.map((event, index) => {
          const complete = scenario.nextEventIndex > index
          const next = !scenario.completed && scenario.nextEventIndex === index
          const tone = complete ? 'success' : next ? 'warning' : 'neutral'
          return <article className="event-card flex gap-4 p-4" data-tone={tone} key={event.atSimS + event.label}><span className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ' + (complete ? 'bg-secondary text-[#002016]' : next ? 'bg-warning text-[#271600]' : 'bg-surface-highest text-muted')}>{complete ? <CheckCircle2 size={15} /> : index + 1}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{event.phase} · +{event.atSimS}s simulated</p><span className={complete ? 'event-badge border-secondary/30 bg-secondary/10 text-secondary' : next ? 'event-badge border-warning/30 bg-warning/10 text-warning' : 'event-badge border-outline bg-surface-high text-muted'}>{complete ? 'Injected' : next ? (scenario.active ? 'Next' : 'Ready') : 'Scheduled'}</span></div><p className="mt-1 text-xs leading-5 text-muted">{event.label}</p></div></article>
        })}
      </div>
    </section>
  }

  function Timeline() {
    return <section className="panel overflow-hidden">
      <div className="panel-header flex items-center justify-between"><h2 className="text-sm font-semibold">Scenario timeline</h2>{scenario.log.length > 0 && <span className="event-badge border-primary/30 bg-primary/10 text-primary">{scenario.log.length} updates</span>}</div>
      <div className="thin-scrollbar max-h-80 space-y-2 overflow-y-auto p-3" aria-live="polite">{scenario.log.length ? scenario.log.map((entry, index) => <div className={'relative rounded-lg border p-3 pl-5 text-xs ' + (index === 0 ? 'border-primary/30 bg-primary/[.06]' : 'border-outline/60 bg-surface-lowest')} key={entry.timestamp + index}><span className={'absolute left-2 top-4 h-1.5 w-1.5 rounded-full ' + (index === 0 ? 'bg-primary shadow-focus' : 'bg-muted')} /><div className="flex items-center justify-between gap-2"><time className="font-mono text-[11px] text-muted">{new Date(entry.timestamp).toLocaleTimeString()}</time>{index === 0 && <span className="event-badge border-primary/30 bg-primary/10 text-primary">Latest</span>}</div><p className="mt-1 leading-5">{entry.message}</p></div>) : <p className="rounded-lg border border-dashed border-outline p-4 text-xs text-muted">Apply a scenario setup to start its timeline.</p>}</div>
    </section>
  }

  function Expectations({ definition: currentDefinition, loaded: currentLoaded }: { definition: ScenarioDefinition; loaded: boolean }) {
    return <section className="panel overflow-hidden">
      <div className="panel-header"><h2 className="text-sm font-semibold">Declared expectations</h2></div>
      <div className="divide-y divide-outline">
        {currentDefinition.expectations.map((expectation, index) => {
          const result = currentLoaded ? (scenario.results[index] ?? 'pending') : 'pending'
          const Icon = result === 'pass' ? CheckCircle2 : result === 'fail' ? XCircle : Circle
          return <div className="flex gap-3 p-3 text-xs" key={expectation.label}><Icon className={'shrink-0 ' + (result === 'pass' ? 'text-secondary' : result === 'fail' ? 'text-danger' : 'text-muted')} size={17} /><div><p className="leading-5">{expectation.label}</p><p className={'mt-1 font-mono text-[11px] uppercase ' + (result === 'pass' ? 'text-secondary' : result === 'fail' ? 'text-danger' : 'text-muted')}>{result}</p></div></div>
        })}
      </div>
    </section>
  }

  function Observations() {
    return <section className="panel p-4">
      <div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-semibold">Actual observations</h2><p className="mt-1 text-[11px] text-muted">Live engine and safety counts</p></div><span className="event-badge border-primary/30 bg-primary/10 text-primary">Live</span></div>
      <div className="grid grid-cols-2 gap-2">
        <Count label="T1 evaluations" value={scenario.observations.tier1Evaluations} tone="primary" />
        <Count label="T1 situations" value={scenario.observations.tier1Situations.length} tone="warning" />
        <Count label="T1 commands" value={scenario.observations.tier1Commands.length} tone="warning" />
        <Count label="T2 branches" value={scenario.observations.tier2Branches.length} tone="primary" />
        <Count label="T2 received" value={scenario.observations.tier2ActionsReceived.length} tone="primary" />
        <Count label="T2 applied" value={scenario.observations.tier2ActionsApplied.length} tone="success" />
        <Count label="T2 blocked" value={scenario.observations.tier2ActionsBlocked.length} tone="warning" />
        <Count label="Backend errors" value={scenario.observations.backendErrors.length} tone="danger" />
        <Count label="Fuzzy bands" value={scenario.observations.fuzzyBands.length} tone="primary" />
        <Count label="Fallbacks" value={scenario.observations.fuzzyFallbackReasons.length} tone="warning" />
        <Count label="Reversals" value={scenario.metrics.commandReversals} tone="warning" />
        <Count label="Mandatory OFF" value={scenario.metrics.mandatoryOffCommands} tone="danger" />
      </div>
      {scenario.observations.tier1Situations.length > 0 && <p className="mt-3 break-words font-mono text-[11px] leading-5 text-tertiary">T1: {scenario.observations.tier1Situations.join(', ')}</p>}
      {scenario.observations.tier2Branches.length > 0 && <p className="mt-2 break-words font-mono text-[11px] leading-5 text-primary">T2: {scenario.observations.tier2Branches.join(', ')}</p>}
      {scenario.observations.fuzzyBands.length > 0 && <p className="mt-2 break-words font-mono text-[11px] leading-5 text-secondary">Bands: {scenario.observations.fuzzyBands.join(' → ')}</p>}
      {scenario.observations.bandTransitions.length > 0 && <p className="mt-2 break-words font-mono text-[11px] leading-5 text-tertiary">Transitions: {scenario.observations.bandTransitions.join(', ')}</p>}
    </section>
  }

  function ComparisonPanel() {
    return <section className="panel overflow-hidden" aria-label="Crisp versus fuzzy comparison">
      <div className="panel-header flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Crisp versus fuzzy A/B</h2><p className="mt-1 text-[11px] text-muted">Identical deterministic setup · backend reset between runs</p></div><span className={comparison.status === 'complete' ? 'event-badge border-secondary/30 bg-secondary/10 text-secondary' : comparison.status === 'error' ? 'event-badge border-danger/30 bg-danger/10 text-danger' : comparisonBusy ? 'event-badge border-warning/30 bg-warning/10 text-warning' : 'event-badge border-outline bg-surface-high text-muted'}>{comparison.status.replaceAll('_', ' ')}</span></div>
      {comparison.error && <p className="m-3 rounded bg-danger/10 p-3 text-xs text-danger">{comparison.error}</p>}
      {comparison.crisp && comparison.fuzzy && comparison.differences ? <>
        <div className="grid gap-3 p-3 sm:hidden">
          {metricRows.map(({ key, label, unit }) => {
            const delta = comparison.differences![key]
            return <article className="rounded-lg border border-outline bg-surface-lowest p-3" key={key}><h3 className="text-xs font-semibold">{label}</h3><dl className="mt-3 grid grid-cols-3 gap-2 text-center"><MetricValue label="Crisp" value={comparison.crisp!.metrics[key]} unit={unit} /><MetricValue label="Fuzzy" value={comparison.fuzzy!.metrics[key]} unit={unit} /><MetricValue label="Delta" value={delta} unit={unit} delta /></dl></article>
          })}
        </div>
        <div className="hidden overflow-x-auto p-3 sm:block">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead><tr className="text-[11px] uppercase text-muted"><th scope="col" className="p-3">Metric</th><th scope="col" className="p-3">Crisp</th><th scope="col" className="p-3">Fuzzy active</th><th scope="col" className="p-3">Δ fuzzy − crisp</th></tr></thead>
            <tbody>{metricRows.map(({ key, label, unit }) => <tr className="border-t border-outline" key={key}><th scope="row" className="p-3 font-semibold">{label}</th><td className="p-3 font-mono">{comparison.crisp!.metrics[key].toFixed(2)} {unit}</td><td className="p-3 font-mono">{comparison.fuzzy!.metrics[key].toFixed(2)} {unit}</td><td className={'p-3 font-mono ' + (comparison.differences![key] < 0 ? 'text-secondary' : comparison.differences![key] > 0 ? 'text-warning' : 'text-muted')}>{comparison.differences![key] > 0 ? '+' : ''}{comparison.differences![key].toFixed(2)} {unit}</td></tr>)}</tbody>
          </table>
        </div>
      </> : <div className="p-6 text-center"><FlaskConical className="mx-auto text-muted" size={28} /><p className="mt-3 text-sm font-semibold">No comparison results yet</p><p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-muted">Use Compare crisp vs fuzzy above to collect grid energy, reserve, optional service, safety, action, and reversal metrics.</p></div>}
    </section>
  }
}

function SetupGroup({ title, children }: { title: string; children: ReactNode }) {
  return <fieldset className="mt-5 border-t border-outline pt-3"><legend className="eyebrow pr-3">{title}</legend><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div></fieldset>
}
function TextField({ label, value, onChange, type = 'text', disabled = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean }) {
  return <label><span className="field-label">{label}</span><input className="field-control" type={type} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>
}
function NumberField({ label, value, onChange, unit, min, max, step = .01, disabled = false }: { label: string; value: number | undefined; onChange: (value: number) => void; unit?: string; min?: number; max?: number; step?: number; disabled?: boolean }) {
  const [draft, setDraft] = useState(() => value === undefined ? '' : String(value))
  useEffect(() => setDraft(value === undefined ? '' : String(value)), [value])
  return <label><span className="field-label">{label}</span><div className="relative"><input className="field-control pr-16 font-mono" type="number" value={draft} min={min} max={max} step={step} disabled={disabled} onChange={(event) => { setDraft(event.target.value); if (event.target.value !== '') onChange(Number(event.target.value)) }} onBlur={() => { if (draft === '') setDraft(value === undefined ? '' : String(value)) }} />{unit && <span className="pointer-events-none absolute right-2 top-3 text-[11px] text-muted">{unit}</span>}</div></label>
}
function OptionalNumberField({ label, value, onChange, unit, min, max, step = .01, disabled = false }: { label: string; value: number | undefined; onChange: (value: number | undefined) => void; unit?: string; min?: number; max?: number; step?: number; disabled?: boolean }) {
  return <label><span className="field-label">{label}</span><div className="relative"><input className="field-control pr-16 font-mono" type="number" value={value ?? ''} placeholder="Physical" min={min} max={max} step={step} disabled={disabled} onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))} />{unit && <span className="pointer-events-none absolute right-2 top-3 text-[11px] text-muted">{unit}</span>}</div></label>
}
function SelectField({ label, value, options, onChange, disabled = false }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void; disabled?: boolean }) {
  return <label><span className="field-label">{label}</span><select className="field-control" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option value={option} key={option}>{option.replaceAll('_', ' ')}</option>)}</select></label>
}
function ToggleField({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <label className={'flex min-h-11 cursor-pointer items-center justify-between rounded-md border p-3 text-sm transition-colors ' + (checked ? 'border-secondary/35 bg-secondary/[.06]' : 'border-outline bg-surface-lowest')}><span>{label}</span><input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /></label>
}
function Stat({ label, value, tone }: { label: string; value: string; tone?: 'primary' | 'success' | 'warning' | 'danger' }) {
  const valueClass = tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-secondary' : tone === 'primary' ? 'text-primary' : 'text-ink'
  return <div className="metric-tile p-3" data-tone={tone}><dt className="text-[11px] font-bold uppercase text-muted">{label}</dt><dd className={'mt-1 break-words font-mono text-xs leading-5 ' + valueClass}>{value}</dd></div>
}
function Count({ label, value, tone }: { label: string; value: number; tone: 'primary' | 'success' | 'warning' | 'danger' }) {
  const valueClass = value === 0 ? 'text-muted' : tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-secondary' : 'text-primary'
  return <div className="metric-tile p-3 text-center" data-tone={value > 0 ? tone : undefined}><strong className={'block font-mono text-lg ' + valueClass}>{value}</strong><span className="text-[11px] uppercase text-muted">{label}</span></div>
}
function MetricValue({ label, value, unit, delta = false }: { label: string; value: number; unit: string; delta?: boolean }) {
  const valueClass = delta ? value < 0 ? 'text-secondary' : value > 0 ? 'text-warning' : 'text-muted' : 'text-ink'
  return <div><dt className="text-[10px] uppercase text-muted">{label}</dt><dd className={'mt-1 font-mono text-xs ' + valueClass}>{delta && value > 0 ? '+' : ''}{value.toFixed(2)} <small>{unit}</small></dd></div>
}
