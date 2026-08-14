# SmartBreaker Control Center

SmartBreaker Control Center is a React and TypeScript dashboard for simulating a solar, battery, inverter, and smart-breaker installation. The browser models the physical plant, streams telemetry to the SmartBreaker backend, executes relay decisions, and exposes the evidence produced by the real Tier-1 and Tier-2 knowledge-based systems.

This repository contains the frontend simulator only. Its decision services run separately:

- Tier-1 calls `edge.tier1_kbs.evaluate` through the local bridge.
- Tier-2 calls `apps.kbs.services.run_cycle` through the Django API.

## Features

- Live power-flow, PV, battery, inverter, grid, and load monitoring
- Independent Tier-1 safety and Tier-2 control switches
- Manual breaker control with Tier-1 safety lockouts
- Configurable site, breaker, backend, and KBS settings
- Twenty-four deterministic Tier-1, Tier-2, fuzzy, integrated, and real-world scenarios
- Persistent browser configuration and versioned simulation checkpoints
- Responsive React Router interface with Vercel deep-link support

## Tech stack

- React 18 and React Router
- TypeScript and Vite
- Tailwind CSS
- Vitest and Testing Library
- ESLint

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- The SmartBreaker Django backend
- The SmartBreaker Tier-1 bridge for Tier-1 evaluation

## Local setup

Install the frontend dependencies:

```bash
git clone https://github.com/AlayhamTaha543/SmartBreakersReact.git
cd SmartBreakersReact
cp .env.example .env.local
npm ci
```

From the separate SmartBreaker backend repository, seed and start the local services:

```bash
DJANGO_SETTINGS_MODULE=config.settings.development python manage.py seed_simulator
DJANGO_SETTINGS_MODULE=config.settings.development python manage.py runserver 127.0.0.1:8000
python edge/simulator_bridge.py --port 8788
```

Then start the frontend:

```bash
npm run dev
```

Vite serves the app at <http://127.0.0.1:8791>.

## Configuration

Copy `.env.example` to `.env.local` to change the initial service connections:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_SMARTBREAKER_BACKEND_URL` | `http://127.0.0.1:8000` | Django API base URL |
| `VITE_SMARTBREAKER_TIER1_URL` | `http://127.0.0.1:8788` | Tier-1 bridge base URL |
| `VITE_SMARTBREAKER_ORGANIZATION` | `1` | Initial organization ID |

These are public, build-time browser values; never put secrets in a `VITE_*` variable. A user can change the connections later on the Configuration page, where they are saved in local storage.

## Application routes

- `/` — live control center and physical power-flow dashboard
- `/configuration` — service, site, breaker, and KBS settings
- `/scenarios` — deterministic scenario catalog and results

## Available commands

```bash
npm run dev        # start the development server
npm run typecheck  # check TypeScript
npm run lint       # run ESLint
npm test           # run the unit and component tests
npm run build      # create the production build in dist/
```

The opt-in live scenario tests require running backend services and are skipped during the standard test command.

Run every scenario with both tiers forced on and print a per-scenario evidence summary:

```bash
RUN_LIVE_SCENARIOS=1 LIVE_FORCE_BOTH_TIERS=1 LIVE_SCENARIO_REPORT=1 \
  npm test -- src/simulation/liveScenarios.test.tsx --reporter=verbose
```

Exercise the reset → crisp → reset → fuzzy-active comparison flow for one
deterministic scenario and print its seven metrics:

```bash
RUN_LIVE_COMPARISON=1 LIVE_COMPARISON_SCENARIO=fuzzy-boundary-noise \
  npm test -- src/simulation/liveScenarios.test.tsx --reporter=verbose
```

The `real-damascus-evening-outage` scenario is a physical reference case: a
4 kWp array, 4 kW inverter, 5 kWh 24 V-class battery at 27% usable charge,
and realistic small-office/clinic loads at 18:00 in July. PV and battery
behavior come from the simulator physics and the checked-in NASA POWER
Damascus climate row; only the loss of the 230 V utility supply is injected.
Tier-1 preserves the mandatory circuit while Tier-2 persists the safety interlock.

## Deploy to Vercel

The repository includes `vercel.json`, which selects Vite, builds to `dist`, and rewrites direct requests such as `/configuration` to the React single-page application.

1. In Vercel, choose **Add New → Project** and import `AlayhamTaha543/SmartBreakersReact`.
2. Keep the detected **Vite** framework preset. The committed settings use `npm run build` and the `dist` output directory.
3. Add `VITE_SMARTBREAKER_BACKEND_URL`, `VITE_SMARTBREAKER_TIER1_URL`, and `VITE_SMARTBREAKER_ORGANIZATION` under **Project Settings → Environment Variables**.
4. Deploy the project.

For a working production simulator, the Django API and Tier-1 bridge must be publicly reachable over HTTPS. They must also allow browser requests from the Vercel deployment domain. A Vercel-hosted HTTPS page cannot call the default local HTTP endpoints on a visitor's machine.

## License

This project is available under the [MIT License](LICENSE).
