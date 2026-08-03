import type { BreakerStatusDTO, ClimateResponse, KBSDecision, KBSSettings, KBSStateDTO, TelemetryDTO, Tier1Result } from './types'

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  let body: unknown
  try { body = await response.json() } catch { body = null }
  if (!response.ok) {
    const detail = body && typeof body === 'object' && 'detail' in body ? String((body as { detail: unknown }).detail) : 'HTTP ' + response.status
    throw new Error(detail)
  }
  return body as T
}
const headers = { 'Content-Type': 'application/json' }
const clean = (value: string) => value.replace(/\/$/, '')

export const simulatorApi = {
  climate(baseUrl: string) { return json<ClimateResponse>(clean(baseUrl) + '/api/kbs/sim/climate/') },
  state(baseUrl: string, organization: number) { return json<KBSStateDTO>(clean(baseUrl) + '/api/kbs/sim/state/?organization=' + organization) },
  settings(baseUrl: string, organization: number, settings: Partial<KBSSettings>) {
    return json<{ updated: Partial<KBSSettings> }>(clean(baseUrl) + '/api/kbs/settings/?organization=' + organization, { method: 'PATCH', headers, body: JSON.stringify(settings) })
  },
  async push(baseUrl: string, telemetry: TelemetryDTO, breakers: BreakerStatusDTO[]) {
    // Keep the writes ordered so each KBS cycle sees a coherent tick, and to
    // avoid lock contention in the SQLite-backed local simulator.
    await json(clean(baseUrl) + '/api/telemetry/readings/', { method: 'POST', headers, body: JSON.stringify(telemetry) })
    await json(clean(baseUrl) + '/api/breakers/status/', { method: 'POST', headers, body: JSON.stringify(breakers) })
  },
  runCycle(baseUrl: string, organization: number) {
    return json<KBSDecision>(clean(baseUrl) + '/api/kbs/sim/run-cycle/', { method: 'POST', headers, body: JSON.stringify({ organization }) })
  },
  ack(baseUrl: string, actionIds: number[]) {
    return json<{ acknowledged: number }>(clean(baseUrl) + '/api/kbs/sim/ack/', { method: 'POST', headers, body: JSON.stringify({ action_ids: actionIds }) })
  },
  reset(baseUrl: string, organization: number) {
    return json<{ reset: boolean }>(clean(baseUrl) + '/api/kbs/sim/reset/', { method: 'POST', headers, body: JSON.stringify({ organization, confirm: true }) })
  },
  breakerOverride(baseUrl: string, organization: number, deviceId: string, switchOn: boolean, timestamp: string) {
    return json(clean(baseUrl) + '/api/kbs/sim/breaker-override/', { method: 'POST', headers, body: JSON.stringify({ organization, device_id: deviceId, switch: switchOn, timestamp }) })
  },
  tier1(baseUrl: string, payload: unknown) {
    return json<Tier1Result>(clean(baseUrl) + '/evaluate', { method: 'POST', headers, body: JSON.stringify(payload) })
  },
}
