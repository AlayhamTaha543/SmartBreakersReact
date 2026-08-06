import type { KBSDecision } from './types'

export const CANONICAL_TIER2_ENGINE = 'apps.kbs.services.run_cycle' as const
export const TIER2_RULE_ENGINE_ALIAS = 'apps.kbs.engine.rules.decide' as const
export const LEGACY_TIER2_ENGINE = 'legacy.apps.kbs.services.run_cycle' as const

export type Tier2DecisionProvenance = 'current' | 'transition' | 'legacy'

type DecisionProvenanceFields = Pick<KBSDecision, 'engine' | 'trace_version' | 'legacy'>

export function tier2DecisionProvenance(
  decision: DecisionProvenanceFields | null,
): Tier2DecisionProvenance | null {
  if (!decision?.engine) return null
  const isLegacy = decision.legacy === true || decision.trace_version === 0
  if (!isLegacy && decision.engine === CANONICAL_TIER2_ENGINE) return 'current'
  if (!isLegacy && decision.engine === TIER2_RULE_ENGINE_ALIAS) return 'transition'
  if (isLegacy && decision.engine === LEGACY_TIER2_ENGINE) return 'legacy'
  throw new Error(
    'Unexpected Tier-2 engine provenance: ' + decision.engine +
    ' (trace version ' + String(decision.trace_version ?? 'unknown') + ')',
  )
}
