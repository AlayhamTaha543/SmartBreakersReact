import type { Page, Route } from '@playwright/test'

export const SIMULATOR_API_PATTERN = /^http:\/\/127\.0\.0\.1:(8000|8788|8999)\/.*/

const cities = ['Damascus', 'Aleppo', 'Latakia', 'Idlib', 'Homs', 'Daraa', 'Deir Ezzour']
const climateRows = cities.flatMap((city, cityIndex) => Array.from({ length: 12 }, (_, index) => ({
  city,
  latitude_deg: 33 + cityIndex / 10,
  longitude_deg: 36,
  month: index + 1,
  season: index + 1 >= 5 && index + 1 <= 10 ? 'summer' : 'winter',
  typical_weather: index + 1 === 7 ? 'sunny' : 'partly_cloudy',
  ghi_kwh_m2_day: 6,
  clearsky_ghi_kwh_m2_day: 7,
  cloud_amount_percent: 35,
  precip_mm_day: 0.4,
  temp_C: 24,
  humidity_percent: 55,
})))

type SimulatorMockOptions = {
  climateError?: boolean
  climateDelayMs?: number
}

function jsonBody(route: Route): unknown {
  try {
    return route.request().postDataJSON()
  } catch {
    return {}
  }
}

async function fulfill(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

export async function installSimulatorMocks(
  page: Page,
  { climateError = false, climateDelayMs = 150 }: SimulatorMockOptions = {},
) {
  await page.route(SIMULATOR_API_PATTERN, async (route) => {
    const path = new URL(route.request().url()).pathname

    if (path === '/api/kbs/sim/climate/') {
      if (climateDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, climateDelayMs))
      }
      if (climateError) {
        await fulfill(route, { detail: 'Fixture climate service offline' }, 503)
        return
      }
      await fulfill(route, { cities, count: climateRows.length, rows: climateRows })
      return
    }

    if (path === '/evaluate') {
      await fulfill(route, {
        engine: 'edge.tier1_kbs.evaluate',
        situation: '',
        commands: [],
        notify: '',
        facts: { inverter: {}, breakers: [], config: {} },
      })
      return
    }

    if (path === '/api/kbs/sim/state/') {
      await fulfill(route, {
        organization: { id: 1, name: 'Simulator Site', latitude: 33.51, longitude: 36.29 },
        settings: {},
        latest_decision: null,
        pending_actions: [],
        recent_alerts: [],
      })
      return
    }

    if (path === '/api/kbs/sim/run-cycle/') {
      await fulfill(route, {
        engine: 'apps.kbs.services.run_cycle',
        branch: null,
        facts: { weather_condition: 'sunny' },
        actions: [],
        detail: 'monitoring',
      })
      return
    }

    if (path === '/api/kbs/settings/') {
      await fulfill(route, { updated: jsonBody(route) })
      return
    }

    if (path === '/api/kbs/sim/ack/') {
      await fulfill(route, { acknowledged: 1 })
      return
    }

    if (path === '/api/kbs/sim/reset/') {
      await fulfill(route, { reset: true })
      return
    }

    if (path === '/api/telemetry/readings/' || path === '/api/breakers/status/' || path === '/api/kbs/sim/breaker-override/') {
      await fulfill(route, { accepted: true })
      return
    }

    await fulfill(route, { detail: 'Unhandled simulator fixture route: ' + path }, 404)
  })
}
