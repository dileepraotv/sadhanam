/**
 * lib/badminton/teamFormats.ts
 *
 * Rubber (submatch) order definitions for BWF team cup formats.
 * These are pure data — no DB, no side effects — consumed by the bracket
 * generators in lib/actions/teamLeague.ts (generateThomasCupBracket,
 * generateUberCupBracket, generateSudirmanCupBracket).
 *
 * Every tie is best-of-5-rubbers (first team to 3 rubber wins takes the tie),
 * matching the existing Corbillon/Swaythling Cup generators — only the
 * discipline mix per rubber differs.
 */

export interface SubmatchDef {
  order: number
  label: string
}

// Labels below deliberately follow the same "(A vs X)" / "(A/B vs X/Y)"
// convention already used by the Corbillon/Swaythling generators (see
// autoAssignPlayerId in TeamLeagueStage.tsx). That existing, untouched
// helper reads this convention purely from the label string — letters
// A/B/C map to team-roster positions 1/2/3 for singles, and any label
// containing "doubles" auto-fills from the team's configured doubles pair.
// Keeping the same convention means Thomas/Uber Cup rosters get sensible
// default player assignments for free, with zero changes to that logic.

/**
 * Thomas Cup (Men's Teams): 3 singles + 2 doubles.
 * Standard BWF order: MS1, MD1, MS2, MD2, MS3.
 */
export const THOMAS_SUBMATCHES: SubmatchDef[] = [
  { order: 1, label: 'Singles 1 — MS1 (A vs X)' },
  { order: 2, label: 'Doubles 1 — MD1 (A/B vs X/Y)' },
  { order: 3, label: 'Singles 2 — MS2 (B vs Y)' },
  { order: 4, label: 'Doubles 2 — MD2 (A/B vs X/Y)' },
  { order: 5, label: 'Singles 3 — MS3 (C vs Z)' },
]

/**
 * Uber Cup (Women's Teams): 3 singles + 2 doubles.
 * Standard BWF order: WS1, WD1, WS2, WD2, WS3.
 */
export const UBER_SUBMATCHES: SubmatchDef[] = [
  { order: 1, label: 'Singles 1 — WS1 (A vs X)' },
  { order: 2, label: 'Doubles 1 — WD1 (A/B vs X/Y)' },
  { order: 3, label: 'Singles 2 — WS2 (B vs Y)' },
  { order: 4, label: 'Doubles 2 — WD2 (A/B vs X/Y)' },
  { order: 5, label: 'Singles 3 — WS3 (C vs Z)' },
]

/**
 * Sudirman Cup (Mixed Teams): all five disciplines, one rubber each.
 * Standard BWF order: MD, WS, MS, WD, XD.
 *
 * Unlike Thomas/Uber, each rubber here is a genuinely distinct discipline
 * requiring specific-gender players, so there is no sensible auto-default —
 * labels intentionally omit the "(A vs X)" pattern AND the word "doubles"
 * (using "Pairs" instead) so the generic doubles auto-fill never fires here;
 * the admin assigns players manually per rubber (same manual-assignment UI,
 * just no prefill — correct, since a Men's/Women's/Mixed pair each need a
 * different gender combination that no single "doubles pair" setting could
 * represent).
 */
export const SUDIRMAN_SUBMATCHES: SubmatchDef[] = [
  { order: 1, label: 'Men\'s Pairs (MD)' },
  { order: 2, label: 'Women\'s Singles (WS)' },
  { order: 3, label: 'Men\'s Singles (MS)' },
  { order: 4, label: 'Women\'s Pairs (WD)' },
  { order: 5, label: 'Mixed Pairs (XD)' },
]
