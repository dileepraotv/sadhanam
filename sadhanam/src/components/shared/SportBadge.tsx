/**
 * SportBadge — canonical badge for differentiating table tennis vs badminton
 * events in the UI (event cards, grids, headers).
 *
 * Table Tennis → 🏓 orange accent (matches the app's primary brand color)
 * Badminton    → 🏸 sky/blue accent (visually distinct from every other
 *                badge color already in use — see FormatTypeBadge)
 */

import { cn } from '@/lib/utils'
import type { SportType } from '@/lib/types'

interface SportBadgeProps {
  sportType?: SportType | null
  size?:      'sm' | 'md'
  className?: string
}

interface SportConfig {
  label: string
  emoji: string
  color: string
}

export const SPORT_CONFIG: Record<SportType, SportConfig> = {
  table_tennis: {
    label: 'Table Tennis',
    emoji: '🏓',
    color: 'text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800/60',
  },
  badminton: {
    label: 'Badminton',
    emoji: '🏸',
    color: 'text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-900/30 border-sky-200 dark:border-sky-800/60',
  },
}

/** Solid accent color (for stripes/borders) — not a Tailwind class, a hex value. */
export const SPORT_ACCENT: Record<SportType, string> = {
  table_tennis: '#F06321',
  badminton:    '#0EA5E9',
}

export function SportBadge({ sportType, size = 'md', className }: SportBadgeProps) {
  const cfg = SPORT_CONFIG[sportType ?? 'table_tennis']

  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs'
  const padding  = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-0.5'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-semibold rounded-full border',
        textSize,
        padding,
        cfg.color,
        className,
      )}
    >
      <span aria-hidden="true">{cfg.emoji}</span>
      {cfg.label}
    </span>
  )
}

/** Helper: just the emoji, for compact inline use (e.g. next to an event name). */
export function sportEmoji(sportType?: SportType | null): string {
  return SPORT_CONFIG[sportType ?? 'table_tennis'].emoji
}

/** Helper: the solid accent hex color for a sport — used for stripes/borders/gradients. */
export function sportAccentColor(sportType?: SportType | null): string {
  return SPORT_ACCENT[sportType ?? 'table_tennis']
}
