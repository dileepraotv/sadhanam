/**
 * Human-readable descriptions of the sport-aware group-seeding method,
 * surfaced in the admin UI near "Assign Players to Groups" so admins know
 * what to expect before they click. Mirrors the logic in seeding.ts.
 */

import type { SportType } from '@/lib/types'

export function seedingMethodCaption(sport: SportType | undefined): string {
  if (sport === 'badminton') {
    return 'BWF draw: Seed 1 → Group A, Seed 2 → Group B. Seeds 3-4, 5-8, 9-16… are drawn by lot into the remaining groups, and same-club players are kept apart where possible.'
  }
  return 'Modified Snake (ITTF): top seeds go straight to Groups A, B, C… — the rest are drawn by lot in bands, keeping strength balanced while adding fairness through randomness.'
}

export function seedingMethodLabel(sport: SportType | undefined): string {
  return sport === 'badminton' ? 'BWF Seeding Draw' : 'Modified Snake (ITTF)'
}
