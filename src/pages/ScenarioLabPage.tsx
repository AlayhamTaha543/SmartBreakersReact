import { ArrowLeft, Battery, CheckCircle2, Circle, FlaskConical, Play, RotateCcw, Square, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { scenarios } from '../simulation/scenarios'
import { useSimulator } from '../state/SimulatorContext'

export function ScenarioLabPage() {
  const { scenario, dashboard, selectScenario, loadScenario, startScenario, stopScenario, setScenarioBatteryVoltage } = useSimulator()
  const [message, setMessage] = useState('')
  const definition = useMemo(() => scenarios.find((item) => item.id === scenario.selectedId) ?? scenarios[0], [scenario.selectedId])
  const loaded = scenario.loadedId === definition.id
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
          <Link className="button-secondary" to="/configuration">Configuration</Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1600px] gap-4 p-4 lg:grid-cols-[330px_1fr_390px]">
        <aside className="panel overflow-hidden">
          <div className="panel-header"><h2 className="eyebrow">Scenario catalog</h2><p className="mt-1 text-xs text-muted">6 Tier‑1 · 8 Tier‑2 · 3 integrated</p></div>
          <div className="thin-scrollbar max-h-[calc(100vh-150px)] overflow-y-auto p-2">
            {(['Tier-1', 'Tier-2', 'Integrated'] as const).map((tier) => <section key={tier}>
              <h3 className="sticky top-0 z-10 bg-surface-lowest px-2 py-2 text-[10px] font-bold uppercase text-muted">{tier}</h3>
              {scenarios.filter((item) => item.tier === tier).map((item) => (
                <button key={item.id} type="button" onClick={() => selectScenario(item.id)}
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
                <button className="button-secondary" type="button" disabled={scenario.active} onClick={() => { loadScenario(definition.id); setMessage('Scenario inputs loaded. Backend history has not been reset.') }}><RotateCcw size={15} /> Load</button>
                <button className="button-primary" type="button" disabled={!loaded || scenario.active} onClick={() => void runClean()}><Play size={15} /> Run clean</button>
                <button className="button-secondary" type="button" disabled={!scenario.active} onClick={stopScenario}><Square size={14} /> Stop</button>
              </div>
              <p className="mt-3 text-xs text-muted" role="status">{message}</p>
              <p className="mt-2 text-[10px] text-tertiary">“Run clean” always requires confirmation before the simulator-only backend reset.</p>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="panel p-4">
              <h2 className="eyebrow mb-3">Run state</h2>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <Stat label="Phase" value={scenario.phase} />
                <Stat label="Elapsed" value={scenario.elapsedRealS.toFixed(1) + ' / ' + definition.durationRealS + 's'} />
                <Stat label="Simulated clock" value={new Date(dashboard.simMs).toLocaleString()} />
                <Stat label="Next event" value={String(scenario.nextEventIndex + 1) + ' / ' + definition.events.length} />
                <Stat label="Tier-1" value={dashboard.tier1.enabled ? dashboard.tier1.status : 'disabled'} />
                <Stat label="Tier-2" value={dashboard.tier2.enabled ? dashboard.tier2.status : 'disabled'} />
              </dl>
            </div>
            <div className="panel p-4">
              <h2 className="eyebrow mb-3">Setup</h2>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <Stat label="Date/time" value={definition.setup.localDateTime} />
                <Stat label="Scale" value={'×' + definition.setup.scale} />
                <Stat label="PV override" value={definition.setup.overrides?.pvW === undefined ? 'physical curve' : definition.setup.overrides.pvW + ' W'} />
                <Stat label="Battery SOC" value={(definition.setup.batterySocPercent ?? 80) + '%'} />
                <Stat label="Power saving" value={definition.setup.powerSaving ? 'ON' : 'OFF'} />
                <Stat label="Backend fault" value={definition.setup.backendOffline ? 'port 8999' : 'none'} />
              </dl>
            </div>
          </section>

          {definition.batteryControl && (
            <section className="panel p-4">
              <div className="flex gap-3"><Battery className="text-secondary" /><div className="flex-1"><h2 className="text-sm font-semibold">{definition.batteryControl.label}</h2><p className="mt-1 text-xs text-muted">{definition.batteryControl.note}</p>
                <div className="mt-3 flex items-center gap-3"><input aria-label={definition.batteryControl.label} className="field-control" type="range" min={definition.batteryControl.min} max={definition.batteryControl.max} step={definition.batteryControl.step} defaultValue={definition.setup.overrides?.batteryVoltageV ?? 24.4} disabled={!loaded || scenario.active} onChange={(event) => setScenarioBatteryVoltage(Number(event.target.value))} /><span className="font-mono text-xs">{scenario.overrides.batteryVoltageV ?? definition.setup.overrides?.batteryVoltageV ?? 24.4} V</span></div>
              </div></div>
            </section>
          )}

          <section className="panel overflow-hidden">
            <div className="panel-header"><h2 className="eyebrow">Injected disturbances</h2></div>
            <div className="divide-y divide-outline">
              {!definition.events.length && <p className="p-4 text-xs text-muted">No disturbance; the scenario observes healthy baseline behavior.</p>}
              {definition.events.map((event, index) => <article className="flex gap-4 p-4" key={event.atSimS + event.label}><span className={'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ' + (scenario.nextEventIndex > index ? 'bg-secondary text-[#002016]' : 'bg-surface-highest text-muted')}>{index + 1}</span><div><p className="text-sm font-semibold">{event.phase} · +{event.atSimS}s simulated</p><p className="mt-1 text-xs text-muted">{event.label}</p></div></article>)}
            </div>
          </section>

          <section className="panel overflow-hidden">
            <div className="panel-header"><h2 className="eyebrow">Scenario timeline</h2></div>
            <div className="thin-scrollbar max-h-52 overflow-y-auto divide-y divide-outline">{scenario.log.length ? scenario.log.map((entry, index) => <div className="p-3 text-xs" key={entry.timestamp + index}><time className="mr-3 font-mono text-[9px] text-muted">{new Date(entry.timestamp).toLocaleTimeString()}</time>{entry.message}</div>) : <p className="p-4 text-xs text-muted">Load a scenario to start its timeline.</p>}</div>
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

function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded bg-surface-lowest p-2"><dt className="text-[9px] font-bold uppercase text-muted">{label}</dt><dd className="mt-1 break-words font-mono text-[10px]">{value}</dd></div> }
function Count({ label, value }: { label: string; value: number }) { return <div className="rounded bg-surface-lowest p-2 text-center"><strong className="block font-mono text-lg">{value}</strong><span className="text-[9px] uppercase text-muted">{label}</span></div> }
