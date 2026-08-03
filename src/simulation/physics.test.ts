import { describe, expect, it } from 'vitest'
import { defaultBreakers, defaultConfiguration } from './defaults'
import { allowedWeather, buildBreakerStatuses, buildTelemetry, pickAutoWeather, solarProduction, solarWindow, stepPhysical } from './physics'
import type { ClimateRow, PhysicalState } from './types'

const row: ClimateRow = {
  city: 'Damascus', latitude_deg: 33.51, longitude_deg: 36.29, month: 7,
  season: 'summer', typical_weather: 'sunny', ghi_kwh_m2_day: 8.19,
  clearsky_ghi_kwh_m2_day: 8.35, cloud_amount_percent: 17.4,
  precip_mm_day: .01, temp_C: 26.4, humidity_percent: 33.1,
}
const wet: ClimateRow = {
  ...row, city: 'Latakia', month: 1, season: 'winter', typical_weather: 'rainy',
  latitude_deg: 35.52, cloud_amount_percent: 64, precip_mm_day: 4.64,
  humidity_percent: 79, ghi_kwh_m2_day: 2.4, clearsky_ghi_kwh_m2_day: 3.26,
}

describe('CSV-backed physical simulation', () => {
  it('derives allowed storm/fog states and deterministic weighted weather', () => {
    expect(allowedWeather(wet)).toEqual(expect.arrayContaining(['rainy', 'storm', 'foggy']))
    expect(pickAutoWeather(wet, new Date('2026-01-15T08:00:00'), () => .999)).toBe('foggy')
    expect(pickAutoWeather(wet, new Date('2026-01-15T12:00:00'), () => .999)).toBe('storm')
  })

  it('produces a bounded solar curve with data-backed daily GHI adjustment', () => {
    const noon = solarProduction(new Date('2026-07-15T12:00:00'), row, 4000, 'sunny')
    const night = solarProduction(new Date('2026-07-15T00:00:00'), row, 4000, 'sunny')
    expect(noon.clearSkyW).toBeGreaterThan(3000)
    expect(noon.clearSkyW).toBeLessThanOrEqual(4000)
    expect(noon.adjustedW / noon.clearSkyW).toBeCloseTo(row.ghi_kwh_m2_day / row.clearsky_ghi_kwh_m2_day, 5)
    expect(night.adjustedW).toBe(0)
    const window = solarWindow(new Date('2026-07-15T12:00:00'), row.latitude_deg)
    expect(window.sunriseH).toBeGreaterThan(4)
    expect(window.sunriseH).toBeLessThan(7)
    expect(window.sunsetH).toBeGreaterThan(17)
    expect(window.sunsetH).toBeLessThan(20)
  })

  it('integrates battery charge/discharge and emits backend units', () => {
    const site = structuredClone(defaultConfiguration.site)
    const state: PhysicalState = {
      simMs: new Date('2026-07-15T12:00:00').getTime(), batterySocWh: 2500,
      heatsinkC: 30, weather: 'sunny', breakers: [], overrides: { pvW: 1000 },
    }
    const flow = stepPhysical(state, site, row, 3600)
    expect(state.batterySocWh).toBeCloseTo(3450)
    expect(flow.chargeW).toBe(1000)
    const telemetry = buildTelemetry(flow, site, 7, state.simMs)
    expect(telemetry.organization).toBe(7)
    expect(telemetry.pv_charging_power_W).toBe(1000)
    expect(telemetry.battery_capacity_percent).toBe(69)

    const breaker = { ...structuredClone(defaultBreakers[1]), switchOn: true, onSinceMs: null, normalW: 230 }
    const status = buildBreakerStatuses([breaker], state.simMs)[0]
    expect(status.cur_power_mW).toBe(230000)
    expect(status.cur_current_mA).toBe(1000)
    expect(status.cur_voltage_mV).toBe(230000)
  })
})
