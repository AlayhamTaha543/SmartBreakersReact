import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AppV2 from './AppV2'
import { SimulatorProvider } from './state/SimulatorContext'

let tier1Situation = ''
const cities = ['Damascus', 'Aleppo', 'Latakia', 'Idlib', 'Homs', 'Daraa', 'Deir Ezzour']
const climateRows = cities.flatMap((city, cityIndex) => Array.from({ length: 12 }, (_, index) => ({
  city, latitude_deg: 33 + cityIndex / 10, longitude_deg: 36, month: index + 1,
  season: index + 1 >= 5 && index + 1 <= 10 ? 'summer' : 'winter',
  typical_weather: index + 1 === 7 ? 'sunny' : 'partly_cloudy',
  ghi_kwh_m2_day: 6, clearsky_ghi_kwh_m2_day: 7,
  cloud_amount_percent: 35, precip_mm_day: .4, temp_C: 24, humidity_percent: 55,
})))

function response(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response
}
function renderApp(path = '/') {
  return render(<MemoryRouter initialEntries={[path]}><SimulatorProvider><AppV2 /></SimulatorProvider></MemoryRouter>)
}

beforeEach(() => {
  localStorage.clear()
  tier1Situation = ''
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/sim/climate/')) return response({ cities, count: 84, rows: climateRows })
    if (url.endsWith('/evaluate')) return response({
      engine: 'edge.tier1_kbs.evaluate', situation: tier1Situation, commands: [],
      notify: '', facts: { inverter: {}, breakers: [], config: {} },
    })
    if (url.includes('/sim/state/')) return response({
      organization: { id: 1, name: 'Simulator Site', latitude: 33.51, longitude: 36.29 },
      settings: {}, latest_decision: null, pending_actions: [], recent_alerts: [],
    })
    if (url.includes('/sim/run-cycle/')) return response({ engine: 'apps.kbs.services.run_cycle', branch: null, facts: null, actions: [], detail: 'skipped' })
    return response({ updated: {}, acknowledged: 1, reset: true })
  }))
})

describe('closed-loop React surfaces', () => {
  it('renders the data-backed dashboard and keeps tier switches independent', async () => {
    const user = userEvent.setup()
    renderApp()
    expect(await screen.findByText('CSV climate environment')).toBeInTheDocument()
    expect(screen.getByText('Damascus')).toBeInTheDocument()
    const tier1 = screen.getByRole('switch', { name: /tier-1 safety enabled/i })
    const tier2 = screen.getByRole('switch', { name: /tier-2 controller enabled/i })
    expect(tier1).toHaveAttribute('aria-checked', 'false')
    expect(tier2).toHaveAttribute('aria-checked', 'false')
    await user.click(tier1)
    expect(tier1).toHaveAttribute('aria-checked', 'true')
    expect(tier2).toHaveAttribute('aria-checked', 'false')
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/evaluate'), expect.anything()))
  })

  it('blocks a manual non-grid ON while Tier-1 danger is active', async () => {
    tier1Situation = 'inverter_overheat'
    const user = userEvent.setup()
    renderApp()
    await user.click(await screen.findByRole('switch', { name: /tier-1 safety enabled/i }))
    expect(await screen.findByText('Situation: inverter_overheat')).toBeInTheDocument()
    const ac = screen.getByRole('switch', { name: /sim-ac-unit breaker off/i })
    await user.click(ac)
    expect(ac).toHaveAttribute('aria-checked', 'false')
    expect(await screen.findByText(/Manual ON blocked by active Tier-1 danger/)).toBeInTheDocument()
  })

  it('exposes supported settings and the complete Scenario Lab instead of an IF/THEN editor', async () => {
    const { unmount } = renderApp('/configuration')
    expect(await screen.findByText('Editable backend KBS settings')).toBeInTheDocument()
    expect(screen.getByLabelText('Tier-2 policy')).toHaveValue('crisp')
    expect(screen.queryByText('IF / THEN')).not.toBeInTheDocument()
    unmount()
    renderApp('/scenarios')
    expect(await screen.findByText('6 Tier‑1 · 14 Tier‑2 · 4 integrated')).toBeInTheDocument()
    expect(screen.getAllByText('T1 · normal operation')).toHaveLength(2)
    expect(screen.getByText('T1 + T2 · danger clears and control returns')).toBeInTheDocument()
  })

  it('shows fuzzy audit evidence and comparison controls', async () => {
    const { unmount } = renderApp()
    expect(await screen.findByText('Latest fuzzy decision cycle')).toBeInTheDocument()
    expect(screen.getByText('Fuzzy supervisor disabled')).toBeInTheDocument()
    expect(screen.getByText('Crisp controller is authoritative.')).toBeInTheDocument()
    unmount()
    renderApp('/scenarios')
    await screen.findByText('Crisp versus fuzzy A/B')
    expect(screen.getByText('Current-run fuzzy cycles')).toBeInTheDocument()
    expect(screen.getByText('0 captured')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Compare crisp vs fuzzy/ })).toBeDisabled()
  })

  it('synchronizes a selected fuzzy policy through the settings API', async () => {
    const user = userEvent.setup()
    renderApp('/configuration')
    const policy = await screen.findByLabelText('Tier-2 policy')
    await user.selectOptions(policy, 'fuzzy_shadow')
    await user.click(screen.getByRole('button', { name: /Save & initialize/ }))
    await waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(([url, init]) =>
        String(url).includes('/api/kbs/settings/') && String(init?.body).includes('fuzzy_shadow'))
      expect(call).toBeTruthy()
    })
  })

  it('persists the light-mode choice', async () => {
    const user = userEvent.setup()
    const { unmount } = renderApp()
    const toggle = await screen.findByRole('button', { name: 'Switch to light mode' })
    await user.click(toggle)
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(localStorage.getItem('smartbreaker:theme')).toBe('light')

    unmount()
    renderApp()
    expect(await screen.findByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument()
  })

  it('edits scenario setup and shows the changed battery voltage immediately', async () => {
    const user = userEvent.setup()
    renderApp('/scenarios')
    await screen.findByText('6 Tier‑1 · 14 Tier‑2 · 4 integrated')
    await user.click(screen.getByRole('button', { name: /T1 · battery critical/ }))
    expect(await screen.findAllByText('T1 · battery critical')).toHaveLength(2)

    const voltage = await screen.findByRole('spinbutton', { name: /Critical-event battery voltage/ })
    expect(voltage).toHaveValue(24.05)
    await user.clear(voltage)
    await user.type(voltage, '23.75')
    expect(voltage).toHaveValue(23.75)
    expect(screen.getByText('23.75 V')).toBeInTheDocument()
    expect(screen.getByText('Battery voltage changes to tester target: 23.75 V')).toBeInTheDocument()

    const scale = screen.getByRole('spinbutton', { name: /^Clock scale/ })
    await user.clear(scale)
    await user.type(scale, '120')
    expect(scale).toHaveValue(120)
    await user.click(screen.getByRole('button', { name: 'Apply setup' }))
    expect(screen.getByRole('button', { name: 'Run clean' })).toBeEnabled()
  })
})
