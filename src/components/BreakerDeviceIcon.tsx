import { AirVent, CalendarClock, Grid3X3, PlugZap, Refrigerator, Server, type LucideIcon } from 'lucide-react'

type DeviceTone = 'primary' | 'secondary' | 'tertiary' | 'warning' | 'neutral'

interface BreakerVisual {
  Icon: LucideIcon
  label: string
  tone: DeviceTone
}

// Shared by the dashboard and configuration views to keep device labels and SVGs consistent.
// eslint-disable-next-line react-refresh/only-export-components
export function breakerVisual(deviceId: string): BreakerVisual {
  const id = deviceId.toLowerCase()
  if (id.includes('server')) return { Icon: Server, label: 'Servers', tone: 'primary' }
  if (id.includes('fridge')) return { Icon: Refrigerator, label: 'Refrigerator', tone: 'secondary' }
  if (id.includes('ac')) return { Icon: AirVent, label: 'Air conditioner', tone: 'tertiary' }
  if (id.includes('event')) return { Icon: CalendarClock, label: 'Scheduled load', tone: 'warning' }
  if (id.includes('grid')) return { Icon: Grid3X3, label: 'Utility grid', tone: 'primary' }
  return { Icon: PlugZap, label: 'Electrical load', tone: 'neutral' }
}

const toneClass: Record<DeviceTone, string> = {
  primary: 'border-primary/25 bg-primary/10 text-primary',
  secondary: 'border-secondary/25 bg-secondary/10 text-secondary',
  tertiary: 'border-tertiary/25 bg-tertiary/10 text-tertiary',
  warning: 'border-warning/25 bg-warning/10 text-warning',
  neutral: 'border-outline bg-surface-high text-muted',
}

export function BreakerDeviceIcon({ deviceId, compact = false }: { deviceId: string; compact?: boolean }) {
  const { Icon, label, tone } = breakerVisual(deviceId)
  return <span className={'inline-flex shrink-0 items-center justify-center rounded-lg border ' + (compact ? 'h-8 w-8' : 'h-11 w-11') + ' ' + toneClass[tone]} title={label}><Icon aria-hidden="true" size={compact ? 16 : 22} /></span>
}
