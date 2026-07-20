'use client'

/**
 * SportFilterTabs — "All / 🏓 Table Tennis / 🏸 Badminton" tab picker.
 * Purely presentational; the parent owns the filter state.
 */

import { cn } from '@/lib/utils'
import type { SportType } from '@/lib/types'

export type SportFilter = 'all' | SportType

const TABS: { id: SportFilter; label: string }[] = [
  { id: 'all',          label: 'All' },
  { id: 'table_tennis', label: '🏓 Table Tennis' },
  { id: 'badminton',    label: '🏸 Badminton' },
]

export function SportFilterTabs({
  filter,
  onChange,
}: {
  filter:   SportFilter
  onChange: (f: SportFilter) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors',
            filter === t.id
              ? 'bg-orange-500 text-white border-orange-500'
              : 'text-muted-foreground border-border hover:border-orange-400/60 hover:text-foreground',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
