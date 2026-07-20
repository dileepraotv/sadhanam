'use client'

/**
 * EventsSportFilter — generic client wrapper that adds sport filter tabs
 * (All / 🏓 Table Tennis / 🏸 Badminton) above a list of events, without
 * dictating how each event card is rendered.
 *
 * Used on championship pages (public + admin) where the event card markup
 * differs (admin cards include delete actions, public cards don't), so we
 * keep the filtering logic here and let the caller supply the render fn.
 *
 * Tabs are hidden automatically when all events share the same sport.
 */

import { useMemo, useState } from 'react'
import { SportFilterTabs, type SportFilter } from '@/components/shared/SportFilterTabs'
import type { SportType } from '@/lib/types'

interface Props<T> {
  events:        T[]
  getSportType: (event: T) => SportType | null | undefined
  children:     (filtered: T[]) => React.ReactNode
}

export function EventsSportFilter<T>({ events, getSportType, children }: Props<T>) {
  const [filter, setFilter] = useState<SportFilter>('all')

  const sportsPresent = useMemo(
    () => new Set(events.map((ev) => getSportType(ev) ?? 'table_tennis')),
    [events, getSportType],
  )

  const filtered = filter === 'all'
    ? events
    : events.filter((ev) => (getSportType(ev) ?? 'table_tennis') === filter)

  return (
    <div className="space-y-4">
      {sportsPresent.size > 1 && (
        <SportFilterTabs filter={filter} onChange={setFilter} />
      )}
      {children(filtered)}
    </div>
  )
}
