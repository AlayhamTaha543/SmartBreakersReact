import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { installSimulatorMocks, SIMULATOR_API_PATTERN } from './simulator-mock'

const routeCases = [
  { name: 'dashboard', path: '/' },
  { name: 'configuration', path: '/configuration?section=kbs' },
  { name: 'scenario-lab', path: '/scenarios?view=setup' },
] as const

async function pauseSimulation(page: Page) {
  const pause = page.getByRole('button', { name: 'Pause physics' })
  if (await pause.isVisible()) {
    await pause.click()
    await expect(page.getByRole('button', { name: 'Run physics' })).toBeVisible()
  }
}

async function openRoute(page: Page, path: string) {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1 })).toBeAttached()

  if (path === '/') {
    await pauseSimulation(page)
    await expect(page.getByText('24.0 °C')).toBeVisible()
  } else if (path.startsWith('/configuration')) {
    await expect(page.getByRole('tablist', { name: 'Configuration sections' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  } else {
    await expect(page.getByRole('tablist', { name: 'Scenario workflow' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  }
}

async function expectNoPageOverflow(page: Page) {
  const layout = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth
    const overflow = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .map((element) => {
        const rect = element.getBoundingClientRect()
        return {
          element: element.tagName.toLowerCase() + (element.className ? '.' + String(element.className).trim().replace(/\s+/g, '.') : ''),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        }
      })
      .filter((item) => item.left < -1 || item.right > viewport + 1)
      .slice(0, 8)
    return { viewport, page: document.documentElement.scrollWidth, overflow }
  })
  expect(
    layout.page,
    'Document overflowed its ' + layout.viewport + 'px viewport: ' + JSON.stringify(layout.overflow),
  ).toBeLessThanOrEqual(layout.viewport + 1)
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })
  await installSimulatorMocks(page)
})

test('shared shell keeps route navigation available', async ({ page }, testInfo) => {
  await openRoute(page, '/')

  if (testInfo.project.name === 'mobile-chromium') {
    await page.getByRole('button', { name: 'Open navigation menu' }).click()
    const navigation = page.getByRole('navigation', { name: 'Mobile simulator navigation' })
    await expect(navigation).toBeVisible()
    await navigation.getByRole('link', { name: 'Configuration' }).click()
  } else {
    await page.getByRole('navigation', { name: 'Simulator navigation' })
      .getByRole('link', { name: 'Configuration' })
      .click()
  }

  await expect(page).toHaveURL(/\/configuration/)
  await expect(page.getByRole('heading', { level: 1, name: 'Physical Simulator & KBS Settings' })).toBeVisible()
})

test('dashboard controls and decision tabs remain operable', async ({ page }, testInfo) => {
  await openRoute(page, '/')

  await expect(page.getByRole('region', { name: 'Operational status' })).toBeVisible()
  await expect(page.getByText('Live PV history')).toHaveCount(0)
  await expect(page.getByText(/Organization 1 · live physical simulator/)).toHaveCount(0)

  const decisionCenter = page.locator('.dashboard-decisions')
  await expect(decisionCenter).toHaveCSS('position', 'static')
  const powerFlow = page.locator('.dashboard-power')
  const breakerPanel = page.locator('.dashboard-breakers')
  const powerBox = await powerFlow.boundingBox()
  const breakerBox = await breakerPanel.boundingBox()
  expect(powerBox).not.toBeNull()
  expect(breakerBox).not.toBeNull()
  if (testInfo.project.name === 'desktop-chromium') {
    expect(Math.abs(powerBox!.y - breakerBox!.y)).toBeLessThanOrEqual(2)
    expect(breakerBox!.x).toBeGreaterThan(powerBox!.x)
  } else {
    expect(breakerBox!.y).toBeGreaterThan(powerBox!.y)
  }

  const tier1 = page.getByRole('switch', { name: 'Tier-1 safety enabled' })
  const tier2 = page.getByRole('switch', { name: 'Tier-2 controller enabled' })
  await expect(tier1).toHaveAttribute('aria-checked', 'false')
  await expect(tier2).toHaveAttribute('aria-checked', 'false')
  await tier1.click()
  await expect(tier1).toHaveAttribute('aria-checked', 'true')
  await expect(tier2).toHaveAttribute('aria-checked', 'false')

  const overview = page.getByRole('tab', { name: 'Overview' })
  await overview.focus()
  await overview.press('ArrowRight')
  const alerts = page.getByRole('tab', { name: /^Alerts/ })
  await expect(alerts).toBeFocused()
  await expect(alerts).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('All clear')).toBeVisible()
  await expect(page.getByText('Refrigerator', { exact: true })).toBeVisible()
  const fuzzyDetails = page.locator('.dashboard-fuzzy')
  if (!await fuzzyDetails.evaluate((element) => (element as HTMLDetailsElement).open)) {
    await fuzzyDetails.locator('summary').click()
  }
  await fuzzyDetails.scrollIntoViewIfNeeded()
  await page.evaluate(() => new Promise(requestAnimationFrame))
  const overlapsFuzzyFlow = await page.evaluate(() => {
    const decision = document.querySelector('.dashboard-decisions')?.getBoundingClientRect()
    const fuzzy = document.querySelector('.dashboard-fuzzy')?.getBoundingClientRect()
    if (!decision || !fuzzy) return true
    return decision.left < fuzzy.right && decision.right > fuzzy.left && decision.top < fuzzy.bottom && decision.bottom > fuzzy.top
  })
  expect(overlapsFuzzyFlow).toBe(false)

  await expectNoPageOverflow(page)
})

test('configuration keeps one draft across URL-backed sections', async ({ page }, testInfo) => {
  await openRoute(page, '/configuration?section=breakers')
  await expect(page).toHaveURL(/\?section=breakers/)
  await expect(page.getByRole('tab', { name: /^Breakers/ })).toHaveAttribute('aria-selected', 'true')

  const breakerTable = page.getByRole('table')
  if (testInfo.project.name === 'mobile-chromium') {
    await expect(breakerTable).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Refrigerator', exact: true })).toBeVisible()
  } else {
    await expect(breakerTable).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Device' })).toBeVisible()
  }

  await page.getByRole('tab', { name: 'KBS', exact: true }).click()
  const policy = page.getByLabel('Tier-2 policy')
  await policy.selectOption('fuzzy_shadow')
  await expect(page.getByText('Unsaved changes')).toBeVisible()

  await page.getByRole('tab', { name: 'Site', exact: true }).click()
  await expect(page).toHaveURL(/\?section=site/)
  await page.getByRole('tab', { name: 'KBS', exact: true }).click()
  await expect(policy).toHaveValue('fuzzy_shadow')

  const save = page.getByRole('button', { name: 'Save & initialize' })
  await expect(save).toBeEnabled()
  await save.click()
  await expect(page.getByRole('status', { name: 'Configuration save status' })).toContainText('Saved locally and synchronized')
  await expectNoPageOverflow(page)
})

test('scenario catalog adapts to desktop and mobile workflows', async ({ page }, testInfo) => {
  await openRoute(page, '/scenarios?view=setup')

  if (testInfo.project.name === 'mobile-chromium') {
    await page.getByRole('button', { name: /Choose scenario/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Choose a scenario' })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Search scenarios').fill('battery critical')
    await dialog.getByRole('button', { name: /T1 · battery critical/ }).click()
    await expect(dialog).toBeHidden()
  } else {
    await page.getByLabel('Search scenarios').fill('battery critical')
    await page.getByRole('button', { name: /T1 · battery critical/ }).click()
  }

  await expect(page.getByRole('heading', { level: 2, name: 'T1 · battery critical' })).toBeVisible()
  await page.getByRole('tab', { name: /^Run/ }).click()
  await expect(page).toHaveURL(/\?view=run/)
  await expect(page.getByRole('heading', { name: 'Run state' })).toBeVisible()
  await expectNoPageOverflow(page)
})

test('dashboard presents deterministic loading and error states', async ({ page }) => {
  await page.unroute(SIMULATOR_API_PATTERN)
  await installSimulatorMocks(page, { climateDelayMs: 800 })
  await page.goto('/')
  await expect(page.getByRole('status')).toContainText('Loading climate data')
  await pauseSimulation(page)
  await expect(page.getByText('Loading climate data')).toBeHidden()
  await expect(page.getByText('24.0 °C')).toBeVisible()

  await page.unroute(SIMULATOR_API_PATTERN)
  await installSimulatorMocks(page, { climateError: true, climateDelayMs: 0 })
  await page.reload()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Climate data unavailable')
  await expect(alert).toContainText('Fixture climate service offline')
  await expect(alert).toContainText('waiting for valid climate data')
})

test('critical accessibility checks pass on primary interfaces', async ({ page }) => {
  for (const routeCase of routeCases) {
    await openRoute(page, routeCase.path)
    const results = await new AxeBuilder({ page }).analyze()
    const blocking = results.violations
      .filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.map((node) => node.target.join(' ')),
      }))
    expect(blocking, 'Accessibility violations on ' + routeCase.path).toEqual([])
  }
})

test('layouts avoid page overflow at the target breakpoint matrix', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'The desktop project drives the explicit viewport matrix.')

  const viewports = [
    { width: 320, height: 800 },
    { width: 768, height: 900 },
    { width: 1024, height: 900 },
    { width: 1920, height: 1080 },
  ]
  const paths = ['/', '/configuration?section=breakers', '/scenarios?view=setup']

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    for (const path of paths) {
      await openRoute(page, path)
      await expectNoPageOverflow(page)
    }
  }
})

test('dark visual baselines remain stable', async ({ page }) => {
  for (const routeCase of routeCases) {
    await openRoute(page, routeCase.path)
    await page.evaluate(async () => { await document.fonts.ready })
    await expect(page).toHaveScreenshot(routeCase.name + '-dark.png', {
      animations: 'disabled',
      caret: 'hide',
    })
  }
})

test('desktop light visual baselines remain stable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Light baselines are captured on the desktop reference viewport.')

  for (const routeCase of routeCases) {
    await openRoute(page, routeCase.path)
    await page.getByRole('button', { name: 'Switch to light mode' }).click()
    await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible()
    await page.evaluate(async () => { await document.fonts.ready })
    await expect(page).toHaveScreenshot(routeCase.name + '-light.png', {
      animations: 'disabled',
      caret: 'hide',
    })
  }
})
