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
  { id: 'carrom',       label: '🔘 Carrom' },
  { id: 'chess',        label: '♟️ Chess' },
]

export function SportFilterTabs({
  filter,
  onChange,
}: {
  filter:   SportFilter
  onChange: (f: SportFilter) => void
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            // Fixed height + centered content so every pill is the same size
            // regardless of label length — emoji glyphs render taller than
            // plain text ("All"), which previously made pills with an emoji
            // look visibly bigger even though the padding values matched.
            'h-8 inline-flex items-center justify-center leading-none whitespace-nowrap',
            'text-xs font-semibold px-3 rounded-full border transition-colors',
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
