import type {
  FuzzyActionStage, FuzzyBand, FuzzyCycleAction, FuzzyDecisionCycle,
  Tier2Policy,
} from '../simulation/types'

const inputOrder = [
  ['power_balance_ratio', 'Power balance'],
  ['battery_reserve_margin', 'Battery reserve margin'],
  ['net_power_trend', 'Net-power trend'],
] as const

const membershipOrder = [
  ['power_balance', 'deficit', 'Power deficit', 'high'],
  ['power_balance', 'balanced', 'Power balanced', 'watch'],
  ['power_balance', 'surplus', 'Power surplus', 'low'],
  ['battery_reserve', 'short', 'Reserve short', 'high'],
  ['battery_reserve', 'adequate', 'Reserve adequate', 'watch'],
  ['battery_reserve', 'ample', 'Reserve ample', 'low'],
  ['net_power_trend', 'falling', 'Trend falling', 'high'],
  ['net_power_trend', 'steady', 'Trend steady', 'watch'],
  ['net_power_trend', 'rising', 'Trend rising', 'low'],
] as const

const bands: FuzzyBand[] = ['low', 'watch', 'high']
const circumference = 2 * Math.PI * 28

const toneClass = (tone?: FuzzyBand | 'neutral') =>
  tone === 'low' ? 'fuzzy-node-low'
    : tone === 'watch' ? 'fuzzy-node-watch'
      : tone === 'high' ? 'fuzzy-node-high'
        : 'fuzzy-node-neutral'

const value = (number: number | null | undefined, digits = 3) =>
  number == null ? '—' : number.toFixed(digits)

const stageLabel: Record<FuzzyActionStage, string> = {
  counterfactual: 'Counterfactual · not executed',
  received: 'Received',
  scheduled: 'Scheduled',
  held_by_tier1: 'Held by Tier-1',
  applied: 'Applied',
  suppressed: 'Suppressed duplicate',
  failed: 'Failed',
  no_op: 'No-op',
  superseded: 'Superseded',
}

function FlowNode({
  label,
  detail,
  tone = 'neutral',
  dashed = false,
  muted = false,
}: {
  label: string
  detail?: string
  tone?: FuzzyBand | 'neutral'
  dashed?: boolean
  muted?: boolean
}) {
  return <div
    className={'fuzzy-flow-node ' + toneClass(tone) + (dashed ? ' fuzzy-flow-dashed' : '') + (muted ? ' fuzzy-flow-muted' : '')}
    data-dashed={dashed || undefined}
  >
    <strong>{label}</strong>
    {detail && <span>{detail}</span>}
  </div>
}

function MembershipRing({
  label,
  degree,
  tone,
}: {
  label: string
  degree: number
  tone: FuzzyBand
}) {
  const bounded = Math.min(1, Math.max(0, degree))
  const percent = Math.round(bounded * 100)
  return <div
    className={'fuzzy-membership ' + toneClass(tone) + (bounded === 0 ? ' fuzzy-membership-zero' : '')}
    aria-label={label + ' membership ' + value(bounded) + ' (' + percent + '%)'}
  >
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle className="fuzzy-ring-track" cx="32" cy="32" r="28" />
      <circle
        className="fuzzy-ring-value"
        cx="32"
        cy="32"
        r="28"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - bounded)}
      />
    </svg>
    <span className="fuzzy-ring-value-text">{value(bounded, 2)}</span>
    <strong>{label}</strong>
  </div>
}

function ActionNodes({
  actions,
  dashed = false,
  emptyLabel,
}: {
  actions: FuzzyCycleAction[]
  dashed?: boolean
  emptyLabel: string
}) {
  if (!actions.length) return <FlowNode label={emptyLabel} tone="watch" dashed={dashed} />
  return <div className="fuzzy-node-stack">
    {actions.map((action, index) => <FlowNode
      key={(action.id ?? action.action_id ?? action.device_id) + ':' + index}
      label={action.device_id + ' → ' + action.action.toUpperCase()}
      detail={stageLabel[action.stage]
        + (action.countdown_s > 0 ? ' · ' + action.countdown_s + 's' : '')
        + (action.reason ? ' · ' + action.reason : '')}
      tone={action.stage === 'failed' || action.stage === 'superseded'
        ? 'high'
        : action.stage === 'applied'
          ? 'low'
          : 'watch'}
      dashed={dashed || action.stage === 'counterfactual'}
    />)}
  </div>
}

function PathStage({ cycle }: { cycle: FuzzyDecisionCycle }) {
  const noCommand = cycle.executedActions.length === 0
  if (cycle.mode === 'authoritative_bypass') {
    return <>
      <section className="fuzzy-flow-stage">
        <h4>Authority</h4>
        <FlowNode
          label="Authoritative bypass"
          detail={cycle.evaluation.fallback_reason?.replaceAll('_', ' ')}
          tone="high"
        />
      </section>
      <Connector />
      <section className="fuzzy-flow-stage">
        <h4>Executed branch</h4>
        <FlowNode label={cycle.executedBranch ?? 'No branch'} tone="high" />
        <ActionNodes actions={cycle.executedActions} emptyLabel="Preserve current state" />
      </section>
    </>
  }
  if (cycle.mode === 'fallback') {
    return <>
      <section className="fuzzy-flow-stage">
        <h4>Validity</h4>
        <FlowNode
          label="Invalid input"
          detail={cycle.evaluation.fallback_reason ?? 'Unknown fuzzy input error'}
          tone="high"
        />
      </section>
      <Connector />
      <section className="fuzzy-flow-stage">
        <h4>Fallback</h4>
        <FlowNode label="Crisp fallback" tone="watch" />
        <FlowNode label={cycle.executedBranch ?? 'No branch'} />
        <ActionNodes actions={cycle.executedActions} emptyLabel="Preserve current state" />
      </section>
    </>
  }

  const fuzzyDashed = cycle.mode === 'shadow'
  const executedIsFuzzy = cycle.mode === 'active'
  return <>
    <section className="fuzzy-flow-stage">
      <h4>Policy</h4>
      <FlowNode
        label={cycle.policy.replaceAll('_', ' ')}
        detail={cycle.mode === 'shadow' ? 'Fuzzy path is audit-only' : 'Fuzzy path controls execution'}
        tone={cycle.mode === 'active' ? 'low' : 'watch'}
      />
    </section>
    <Connector />
    <section className="fuzzy-flow-stage">
      <h4>Fuzzy path</h4>
      <FlowNode
        label={cycle.fuzzyBranch ?? 'No fuzzy command'}
        detail={fuzzyDashed ? 'Not executed' : 'Selected'}
        tone={cycle.evaluation.risk_band ?? 'watch'}
        dashed={fuzzyDashed}
      />
      <ActionNodes
        actions={cycle.fuzzyActions}
        dashed={fuzzyDashed}
        emptyLabel="Preserve current state"
      />
    </section>
    <Connector dashed={!executedIsFuzzy} />
    <section className="fuzzy-flow-stage">
      <h4>Executed path</h4>
      <FlowNode
        label={cycle.executedBranch ?? 'No branch'}
        detail={executedIsFuzzy ? 'Fuzzy execution' : 'Crisp execution'}
        tone={noCommand ? 'watch' : 'low'}
      />
      <ActionNodes actions={cycle.executedActions} emptyLabel="Preserve current state" />
    </section>
    {cycle.counterfactualBranch && cycle.mode === 'active' && <>
      <Connector dashed />
      <section className="fuzzy-flow-stage">
        <h4>Crisp counterfactual</h4>
        <FlowNode
          label={cycle.counterfactualBranch}
          detail="Not executed"
          dashed
        />
        <ActionNodes
          actions={cycle.counterfactualActions}
          dashed
          emptyLabel="No counterfactual command"
        />
      </section>
    </>}
  </>
}

function Connector({ dashed = false }: { dashed?: boolean }) {
  return <span className={'fuzzy-flow-connector' + (dashed ? ' fuzzy-flow-connector-dashed' : '')} aria-hidden="true" />
}

export function FuzzyDecisionFlow({
  cycle,
  policy,
  title = 'Fuzzy decision flow',
}: {
  cycle: FuzzyDecisionCycle | null
  policy: Tier2Policy
  title?: string
}) {
  if (!cycle) {
    return <section className="panel p-4" aria-label={title}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="eyebrow">{title}</h2>
        <span className="event-badge border-outline bg-surface-high text-muted">{policy.replaceAll('_', ' ')}</span>
      </div>
      <FlowNode
        label={policy === 'crisp' ? 'Fuzzy supervisor disabled' : 'Awaiting fuzzy evaluation'}
        detail={policy === 'crisp' ? 'Crisp controller is authoritative.' : 'The next Tier-2 cycle will populate this flow.'}
        muted
      />
    </section>
  }

  const evaluation = cycle.evaluation
  const controllerBand = evaluation.controller?.current_band
    ?? evaluation.risk_band
    ?? null
  const showInference = cycle.mode !== 'authoritative_bypass'
    && cycle.mode !== 'fallback'

  return <section className="panel overflow-hidden" aria-label={title}>
    <div className="panel-header flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="eyebrow">{title}</h2>
        <p className="mt-1 font-mono text-[10px] text-muted">
          Decision {cycle.decisionId} · {cycle.time ? new Date(cycle.time).toLocaleString() : 'time unavailable'}
        </p>
      </div>
      <span className="event-badge border-primary/30 bg-primary/10 text-primary">
        {cycle.mode.replaceAll('_', ' ')}
      </span>
    </div>
    <div className="thin-scrollbar overflow-x-auto p-4">
      <div className="fuzzy-flow">
        {showInference && <>
          <section className="fuzzy-flow-stage">
            <h4>Normalized inputs</h4>
            <div className="fuzzy-node-stack">
              {inputOrder.map(([key, label]) => <FlowNode
                key={key}
                label={label}
                detail={value(evaluation.inputs[key])}
              />)}
            </div>
          </section>
          <Connector />
          <section className="fuzzy-flow-stage fuzzy-flow-memberships">
            <h4>Memberships</h4>
            <div className="fuzzy-membership-grid">
              {membershipOrder.map(([input, term, label, tone]) => <MembershipRing
                key={input + ':' + term}
                label={label}
                degree={evaluation.memberships[input]?.[term] ?? 0}
                tone={tone}
              />)}
            </div>
          </section>
          <Connector />
          <section className="fuzzy-flow-stage">
            <h4>Fired rules</h4>
            <div className="fuzzy-node-stack">
              {evaluation.fired_rules.length
                ? evaluation.fired_rules.map((rule) => <FlowNode
                  key={rule.rule_id}
                  label={'Rule ' + rule.rule_id + ' → ' + rule.then}
                  detail={
                    rule.if.power_balance + ' ∧ '
                    + rule.if.battery_reserve + ' ∧ '
                    + rule.if.net_power_trend + ' · '
                    + value(rule.strength, 2)
                  }
                  tone={rule.then}
                />)
                : <FlowNode label="No rules fired" muted />}
            </div>
          </section>
          <Connector />
          <section className="fuzzy-flow-stage">
            <h4>Aggregation</h4>
            <div className="fuzzy-node-stack">
              {bands.map((band) => <FlowNode
                key={band}
                label={band + ' strength'}
                detail={value(evaluation.aggregated_strengths[band] ?? 0, 2)}
                tone={band}
                muted={(evaluation.aggregated_strengths[band] ?? 0) === 0}
              />)}
              <FlowNode
                label="Centroid risk score"
                detail={value(evaluation.risk_score, 1) + ' / 100'}
                tone={evaluation.inferred_band ?? 'neutral'}
              />
            </div>
          </section>
          <Connector />
          <section className="fuzzy-flow-stage">
            <h4>Band control</h4>
            <FlowNode
              label={'Inferred · ' + (evaluation.inferred_band ?? 'none')}
              tone={evaluation.inferred_band ?? 'neutral'}
            />
            <span className="fuzzy-band-transition">
              {evaluation.controller?.transition?.replaceAll('_', ' ') ?? 'no transition'}
            </span>
            <FlowNode
              label={'Controller · ' + (controllerBand ?? 'none')}
              detail={controllerBand !== evaluation.inferred_band ? 'Hysteresis retains a different band' : 'Agrees with inference'}
              tone={controllerBand ?? 'neutral'}
            />
          </section>
          <Connector />
        </>}
        <PathStage cycle={cycle} />
      </div>
    </div>
  </section>
}

