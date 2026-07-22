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

/**
 * SPORT_UI — the single source of truth for sport-tinted Tailwind classes.
 * Used anywhere that previously hardcoded orange (table tennis's brand
 * color) regardless of which sport the screen is actually showing — e.g.
 * the live match-scoring screen. table_tennis keeps the app's orange
 * brand color; badminton uses the same sky-blue used by SportBadge so the
 * whole app reads consistently as "which sport am I looking at".
 *
 * IMPORTANT: every field is a fully-spelled-out literal class string
 * (including any `hover:`/`focus:` variant prefixes). Tailwind's build
 * only generates CSS for class names it can find verbatim in the source
 * text it scans — runtime string concatenation like `hover:${x}` produces
 * a class name that exists nowhere in the source, so it silently never
 * gets any CSS. Keep every combination pre-composed here instead.
 */
export interface SportUiClasses {
  hex:            string   // solid hex — for inline styles (header bg, etc.)
  bgSolid:        string   // bg-*-500 — solid button backgrounds
  hoverBgSolid:   string   // hover:bg-*-400 — hover state for bgSolid buttons
  text:           string   // text-*-600 dark:text-*-400
  bgLight:        string   // bg-*-100 dark:bg-*-900/40 — light fill (badges, banners)
  border:         string   // border-*-400 — active/selected borders
  hoverBorder:    string   // hover:border-*-400
  borderLight:    string   // border-*-300 dark:border-*-700/60 — subtle banner borders
  ring:           string   // ring-*-400 — plain highlight ring
  ringSoft:       string   // ring-*-400/20 — a very light ring tint (decider highlight)
  bgSoft:         string   // bg-*-200/60 dark:bg-*-900/40 — softer fill than bgLight
  focusRing:      string   // focus:ring-2 focus:ring-*-400/40 — input focus ring
}

export const SPORT_UI: Record<SportType, SportUiClasses> = {
  table_tennis: {
    hex:          '#F06321',
    bgSolid:      'bg-orange-500',
    hoverBgSolid: 'hover:bg-orange-400',
    text:         'text-orange-600 dark:text-orange-400',
    bgLight:      'bg-orange-100 dark:bg-orange-900/40',
    border:       'border-orange-400',
    hoverBorder:  'hover:border-orange-400',
    borderLight:  'border-orange-300 dark:border-orange-700/60',
    ring:         'ring-orange-400',
    ringSoft:     'ring-orange-400/20',
    bgSoft:       'bg-orange-200/60 dark:bg-orange-900/40',
    focusRing:    'focus:ring-2 focus:ring-orange-400/40',
  },
  badminton: {
    hex:          '#0EA5E9',
    bgSolid:      'bg-sky-500',
    hoverBgSolid: 'hover:bg-sky-400',
    text:         'text-sky-600 dark:text-sky-400',
    bgLight:      'bg-sky-100 dark:bg-sky-900/40',
    border:       'border-sky-400',
    hoverBorder:  'hover:border-sky-400',
    borderLight:  'border-sky-300 dark:border-sky-700/60',
    ring:         'ring-sky-400',
    ringSoft:     'ring-sky-400/20',
    bgSoft:       'bg-sky-200/60 dark:bg-sky-900/40',
    focusRing:    'focus:ring-2 focus:ring-sky-400/40',
  },
}

export function sportUi(sportType?: SportType | null): SportUiClasses {
  return SPORT_UI[sportType ?? 'table_tennis']
}
