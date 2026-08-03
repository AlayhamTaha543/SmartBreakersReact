import { LoaderCircle } from 'lucide-react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { ConfigurationV2 } from './pages/ConfigurationV2'
import { DashboardV2 } from './pages/DashboardV2'
import { ScenarioLabPage } from './pages/ScenarioLabPage'
import { useSimulator } from './state/SimulatorContext'

export default function AppV2() {
  const { loading } = useSimulator()
  if (loading) return <main className="flex min-h-screen items-center justify-center bg-surface text-ink"><div role="status" className="text-center"><LoaderCircle className="mx-auto animate-spin text-primary" /><p className="mt-3 text-xs text-muted">Loading CSV climate service…</p></div></main>
  return <Routes>
    <Route path="/" element={<DashboardV2 />} />
    <Route path="/configuration" element={<ConfigurationV2 />} />
    <Route path="/scenarios" element={<ScenarioLabPage />} />
    <Route path="/dashboard" element={<Navigate to="/" replace />} />
    <Route path="*" element={<main className="flex min-h-screen items-center justify-center bg-surface p-4 text-ink"><div className="panel p-6 text-center"><h1 className="text-xl font-semibold">Control surface not found</h1><Link className="button-primary mt-4" to="/">Dashboard</Link></div></main>} />
  </Routes>
}
