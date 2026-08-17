import { useRef, type KeyboardEvent } from 'react'

export type PageTab<T extends string> = {
  value: T
  label: string
  description?: string
  badge?: string | number
}

export function PageTabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string
  tabs: PageTab<T>[]
  value: T
  onChange: (value: T) => void
}) {
  const refs = useRef(new Map<T, HTMLButtonElement>())
  const activate = (next: T) => {
    onChange(next)
    requestAnimationFrame(() => refs.current.get(next)?.focus())
  }
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let target = index
    if (event.key === 'ArrowRight') target = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') target = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') target = 0
    else if (event.key === 'End') target = tabs.length - 1
    else return
    event.preventDefault()
    activate(tabs[target].value)
  }

  return <div className="page-tabs thin-scrollbar" role="tablist" aria-label={label}>
    {tabs.map((tab, index) => {
      const selected = tab.value === value
      return <button
        key={tab.value}
        ref={(node) => {
          if (node) refs.current.set(tab.value, node)
          else refs.current.delete(tab.value)
        }}
        id={'tab-' + tab.value}
        type="button"
        role="tab"
        aria-selected={selected}
        aria-controls={'panel-' + tab.value}
        tabIndex={selected ? 0 : -1}
        className={'page-tab' + (selected ? ' page-tab-active' : '')}
        onClick={() => onChange(tab.value)}
        onKeyDown={(event) => keyDown(event, index)}
      >
        <span>{tab.label}</span>
        {tab.badge !== undefined && <span className="page-tab-badge">{tab.badge}</span>}
        {tab.description && <small>{tab.description}</small>}
      </button>
    })}
  </div>
}
