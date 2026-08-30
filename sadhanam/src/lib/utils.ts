import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { MatchFormat, SportType, Tournament } from './types'
import { SPORT_RULES } from './scoring/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

export function formatFormatLabel(format: MatchFormat): string {
  const labels = { bo1: 'Best of 1', bo3: 'Best of 3', bo5: 'Best of 5', bo7: 'Best of 7' }
  return labels[format]
}

/**
 * Sport-aware match format label. Chess and Carrom don't play "best of N
 * games" — chess is a single decisive game, carrom races to a target point
 * total across a capped number of boards. Table tennis/badminton keep the
 * familiar "Best of N" label.
 */
export function matchFormatLabelForSport(t: Pick<Tournament, 'sport_type' | 'format' | 'carrom_board_target' | 'carrom_max_boards'>): string {
  const sport: SportType = t.sport_type ?? 'table_tennis'
  if (sport === 'chess')  return 'Single Game'
  if (sport === 'carrom') {
    const target = t.carrom_board_target ?? SPORT_RULES.carrom.boardTarget
    const boards = t.carrom_max_boards   ?? SPORT_RULES.carrom.maxBoards
    return `Race to ${target} pts · ${boards} boards`
  }
  return formatFormatLabel((t.format as MatchFormat) ?? 'bo5')
}

export function nextPowerOf2(n: number): number {
  if (n <= 0) return 2
  let p = 1
  while (p < n) p <<= 1
  return p
}

export function getRoundName(roundNumber: number, totalRounds: number): string {
  const fromFinal = totalRounds - roundNumber
  if (fromFinal === 0) return 'Final'
  if (fromFinal === 1) return 'Semifinal'
  if (fromFinal === 2) return 'Quarterfinal'
  const roundOf = Math.pow(2, fromFinal + 1)
  return `R${roundOf}`
}

export function totalRoundsForSize(bracketSize: number): number {
  return Math.log2(bracketSize)
}

/** Full round tab labels — no abbreviations */
export function getRoundTab(roundNumber: number, totalRounds: number): string {
  const fromFinal = totalRounds - roundNumber
  if (fromFinal === 0) return 'Final'
  if (fromFinal === 1) return 'Semi Finals'
  if (fromFinal === 2) return 'Quarter Finals'
  const roundOf = Math.pow(2, fromFinal + 1)
  return `Round ${roundOf}`
}

export function getSeedLabel(seed: number | null): string {
  if (!seed) return ''
  return `[${seed}]`
}

/**
 * Display name for a player row — appends the partner's name for a carrom
 * doubles pair (see migration v14: players.partner_name). Every other sport
 * leaves partner_name null, so this is a no-op everywhere else.
 */
export function playerDisplayName(player?: { name: string; partner_name?: string | null } | null): string {
  if (!player) return 'TBD'
  return player.partner_name ? `${player.name} / ${player.partner_name}` : player.name
}

export function isByeOrEmpty(playerId: string | null, isBye?: boolean): boolean {
  return !playerId || !!isBye
}
