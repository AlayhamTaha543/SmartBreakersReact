import { describe, expect, it } from 'vitest'
import {
  CANONICAL_TIER2_ENGINE,
  LEGACY_TIER2_ENGINE,
  TIER2_RULE_ENGINE_ALIAS,
  tier2DecisionProvenance,
} from './provenance'

describe('Tier-2 decision provenance', () => {
  it('accepts the canonical service wrapper for current traced decisions', () => {
    expect(tier2DecisionProvenance({
      engine: CANONICAL_TIER2_ENGINE, trace_version: 1,
    })).toBe('current')
  })

  it('accepts the known trace-v1 persistence alias during rolling upgrades', () => {
    expect(tier2DecisionProvenance({
      engine: TIER2_RULE_ENGINE_ALIAS, trace_version: 1,
    })).toBe('transition')
  })

  it('accepts only the exact legacy engine for trace-v0 records', () => {
    expect(tier2DecisionProvenance({
      engine: LEGACY_TIER2_ENGINE, trace_version: 0, legacy: true,
    })).toBe('legacy')
    expect(() => tier2DecisionProvenance({
      engine: CANONICAL_TIER2_ENGINE, trace_version: 0, legacy: true,
    })).toThrow(/Unexpected Tier-2 engine provenance/)
  })

  it('continues rejecting unknown engine identifiers', () => {
    expect(() => tier2DecisionProvenance({
      engine: 'unknown.engine' as typeof CANONICAL_TIER2_ENGINE,
      trace_version: 1,
    })).toThrow(/Unexpected Tier-2 engine provenance/)
  })
})
