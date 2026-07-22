/**
 * EventGrid — dense grid of active events.
 *
 * Compact cards showing format badge, championship context,
 * current stage, live indicator, and progress bar.
 *
 * Also renders sport filter tabs (All / 🏓 Table Tennis / 🏸 Badminton)
 * when the active events span more than one sport.
 */

'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Swords, Users, Layers, ChevronRight } from 'lucide-react'
import { LiveBadge } from '@/components/shared/LiveBadge'
import { Badge } from '@/components/ui/index'
import { SportBadge, sportAccentColor, SPORT_CONFIG } from '@/components/shared/SportBadge'
import { SportFilterTabs, type SportFilter } from '@/components/shared/SportFilterTabs'
import { cn } from '@/lib/utils'
import type { SportType } from '@/lib/types'
import type { ActiveEventRow } from './types'

interface Props {
  events: ActiveEventRow[]
}

const SPORT_ORDER: SportType[] = ['table_tennis', 'badminton']

export function EventGrid({ events }: Props) {
  const [filter, setFilter] = useState<SportFilter>('all')

  const sportsPresent = useMemo(
    () => new Set(events.map((ev) => ev.sportType)),
    [events],
  )

  const filtered = filter === 'all' ? events : events.filter((ev) => ev.sportType === filter)

  // Group into sport sections when showing everything with more than one
  // sport present — avoids interleaving both sports in one flat grid.
  const showGrouped = filter === 'all' && sportsPresent.size > 1
  const groups: { sport: SportType; items: ActiveEventRow[] }[] = showGrouped
    ? SPORT_ORDER
        .filter(s => sportsPresent.has(s))
        .map(s => ({ sport: s, items: filtered.filter(ev => ev.sportType === s) }))
    : [{ sport: 'table_tennis', items: filtered }]

  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/50 bg-card/30 p-8 text-center">
        <p className="text-sm text-muted-foreground">No active events at the moment.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {sportsPresent.size > 1 && (
        <SportFilterTabs filter={filter} onChange={setFilter} />
      )}
      {groups.map(group => (
        <div key={group.sport} className="space-y-2.5">
          {showGrouped && (
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
              <span aria-hidden="true">{SPORT_CONFIG[group.sport].emoji}</span>
              {SPORT_CONFIG[group.sport].label}
              <span className="text-xs font-normal text-muted-foreground">({group.items.length})</span>
            </h3>
          )}
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((ev) => (
              <EventCard key={ev.id} event={ev} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Format badge ───────────────────────────────────────────────────────────────
function FormatBadge({ formatType }: { formatType: string | null }) {
  if (formatType === 'multi_rr_to_knockout') {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest
        px-1.5 py-0.5 rounded-full
        bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300
        border border-orange-200/80 dark:border-orange-800/50">
        <Layers className="h-2.5 w-2.5" />
        GRP→KO
      </span>
    )
  }
  if (formatType === 'single_round_robin') {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest
        px-1.5 py-0.5 rounded-full
        bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300
        border border-sky-200/80 dark:border-sky-800/50">
        <Users className="h-2.5 w-2.5" />
        RR
      </span>
    )
  }
  // default: single_knockout
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest
      px-1.5 py-0.5 rounded-full
      bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300
      border border-slate-200/80 dark:border-slate-700/50">
      <Swords className="h-2.5 w-2.5" />
      KO
    </span>
  )
}

function EventCard({ event: ev }: { event: ActiveEventRow }) {
  const href = ev.champId
    ? `/championships/${ev.champId}/events/${ev.id}`
    : `/tournaments/${ev.id}`

  const isLive = ev.liveCount > 0
  const accent = sportAccentColor(ev.sportType)

  return (
    <Link
      href={href}
      className={cn(
        'group relative flex flex-col gap-2 rounded-xl border bg-card p-3.5 overflow-hidden',
        'hover:shadow-md transition-all duration-200',
        isLive
          ? 'border-orange-500/30 hover:border-orange-500/60 hover:shadow-orange-500/8'
          : 'border-border hover:border-orange-400/40 hover:shadow-black/6',
      )}
    >
      {/* Status stripe — tinted by sport when idle, orange/green when live/done */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{
          background: isLive
            ? 'linear-gradient(90deg, #F06321, #F5853F)'
            : ev.progress >= 100
              ? '#22c55e'
              : accent,
          opacity: isLive || ev.progress >= 100 ? 1 : 0.5,
        }}
      />

      {/* Sport accent bar on the left edge for quick scanning */}
      <div
        className="absolute top-0 left-0 bottom-0 w-[3px]"
        style={{ background: accent }}
      />

      {/* Championship label */}
      {ev.champName && (
        <p className="text-[11px] font-bold uppercase tracking-widest text-orange-500/70 dark:text-orange-400/60 truncate pt-0.5">
          {ev.champName}
        </p>
      )}

      {/* Event name + live badge */}
      <div className="flex items-start gap-1.5">
        <h3 className="flex-1 font-bold text-sm text-foreground leading-tight
          group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors line-clamp-1">
          {ev.name}
        </h3>
        {isLive && (
          <LiveBadge className="text-[9px] px-1.5 py-0 gap-1 shrink-0" />
        )}
        {ev.progress >= 100 && !isLive && (
          <Badge variant="success" className="text-[9px] px-1.5 py-0 shrink-0">Done</Badge>
        )}
      </div>

      {/* Sport + format + stage */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <SportBadge sportType={ev.sportType} size="sm" />
        <FormatBadge formatType={ev.formatType} />
        <span className="text-[11px] text-muted-foreground/70 truncate">{ev.stageLabel}</span>
      </div>

      {/* Progress bar (only if matches exist) */}
      {ev.totalMatches > 0 && (
        <div className="space-y-0.5 mt-auto">
          <div className="h-1 rounded-full bg-muted/40 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${ev.progress}%`,
                background: ev.progress >= 100
                  ? '#22c55e'
                  : 'linear-gradient(90deg, #F06321, #F5853F)',
              }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground/50 tabular-nums">
            {ev.doneMatches}/{ev.totalMatches} matches
          </p>
        </div>
      )}

      <ChevronRight className="absolute right-3 bottom-3.5 h-3 w-3 text-muted-foreground/25
        group-hover:text-orange-500/60 group-hover:translate-x-0.5 transition-all" />
    </Link>
  )
}
