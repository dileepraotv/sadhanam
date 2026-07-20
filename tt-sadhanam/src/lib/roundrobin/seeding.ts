/**
 * roundrobin/seeding.ts
 *
 * Sport-aware seed placement for round-robin groups.
 *
 * Both supported sports place seeded players in ordered "bands": the first
 * band is fixed/deterministic, every later band is drawn by lot (a random
 * order within the band) rather than a deterministic alternating snake.
 * This mirrors real-world seeding rules:
 *
 *   table_tennis — "Modified Snake" (ITTF-preferred method)
 *     Seeds 1..G go directly to Groups 1..G in order. Remaining seeds are
 *     drawn in bands of size G (5-8, 9-12, …) — every band still gives each
 *     group exactly one player from that band, but which seed lands in
 *     which group is drawn by lot rather than fixed, adding the
 *     unpredictability ITTF describes while keeping strength balanced.
 *
 *   badminton — BWF seeding draw
 *     Seed 1 -> Group 1 (A), Seed 2 -> Group 2 (B) — fixed.
 *     Seeds 3-4, 5-8, 9-16, … are drawn by lot into the remaining group
 *     tops, band size doubling each round (BWF's 1/2/4/8/16 seeding rounds)
 *     until every group has exactly one seed. Any further seeded players
 *     (beyond one per group) fall back to full-group bands drawn by lot,
 *     same as table tennis.
 *
 * On top of the band draw, both sports apply a best-effort club/association
 * separation: when a player could go into more than one eligible group for
 * their band, a group that doesn't already contain a same-club player is
 * preferred. This never blocks assignment — if every eligible group already
 * has a clash, the draw proceeds anyway.
 */

import type { SportType } from '@/lib/types'

export interface SeedCandidate {
  id:   string
  seed: number
  club: string | null
}

type Rng = () => number

interface Band {
  size:         number
  targetGroups: string[]   // groups this band's players are drawn into
  isFixed:      boolean    // true = deterministic positional mapping, no shuffle
}

/**
 * Builds the ordered list of seeding bands for a sport.
 * Exported for unit testing.
 */
export function buildBandPlan(
  sport:         SportType,
  groupOrder:    string[],
  totalSeeded:   number,
): Band[] {
  const G    = groupOrder.length
  const plan: Band[] = []
  let placed = 0

  if (sport === 'badminton') {
    // Phase 1 — give every group exactly one top seed, band sizes 2,2,4,8,16,…
    let cursor  = 0
    let bandIdx = 0
    let size    = 2
    while (cursor < G && placed < totalSeeded) {
      const remainingGroups = G - cursor
      const bandSize        = Math.min(bandIdx < 2 ? 2 : size, remainingGroups, totalSeeded - placed)
      plan.push({
        size:         bandSize,
        targetGroups: groupOrder.slice(cursor, cursor + bandSize),
        isFixed:      bandIdx === 0,
      })
      cursor  += bandSize
      placed  += bandSize
      bandIdx++
      if (bandIdx >= 2) size *= 2
    }
    // Phase 2 — extra seeded players beyond one-per-group: full-group bands, drawn by lot.
    while (placed < totalSeeded) {
      const bandSize = Math.min(G, totalSeeded - placed)
      plan.push({ size: bandSize, targetGroups: groupOrder.slice(0, bandSize), isFixed: false })
      placed += bandSize
    }
  } else {
    // table_tennis (and default): band 1 fixed 1:1, later bands full-group, drawn by lot.
    let bandIdx = 0
    while (placed < totalSeeded) {
      const bandSize = Math.min(G, totalSeeded - placed)
      plan.push({ size: bandSize, targetGroups: groupOrder.slice(0, bandSize), isFixed: bandIdx === 0 })
      placed += bandSize
      bandIdx++
    }
  }

  return plan
}

/**
 * Assigns seeded players (already sorted by seed ascending) into groups
 * according to the sport's band structure. Returns a Map<groupId, playerId[]>
 * of new placements (does not clear existing assignments — caller merges).
 *
 * groupOrder: the canonical group order (index 0 = "Group 1" / "A", etc.)
 * currentGroupClubs: mutated as players are placed, so the caller's overall
 *   assignment (including Pass-1 preferred-group placements) is respected
 *   for club-separation purposes across the whole run.
 */
export function assignSeededPlayersToGroups(
  sport:             SportType,
  seededPlayers:     SeedCandidate[],   // sorted by seed ascending
  groupOrder:        string[],          // groupIds in canonical order
  currentGroupClubs: Map<string, Set<string>>,
  rng:               Rng = Math.random,
): Map<string, string[]> {
  const result: Map<string, string[]> = new Map(groupOrder.map(gid => [gid, []]))
  if (!seededPlayers.length) return result

  const plan = buildBandPlan(sport, groupOrder, seededPlayers.length)

  let cursor = 0
  for (const band of plan) {
    const bandPlayers = seededPlayers.slice(cursor, cursor + band.size)
    cursor += band.size
    placeBand(bandPlayers, band.targetGroups, result, currentGroupClubs, rng, band.isFixed)
  }

  return result
}

function placeBand(
  bandPlayers:       SeedCandidate[],
  targetGroups:      string[],
  result:            Map<string, string[]>,
  currentGroupClubs: Map<string, Set<string>>,
  rng:               Rng,
  isFixed:           boolean,
): void {
  // Fixed band: strict positional mapping (seed i -> targetGroups[i]) — the
  // deterministic "top seeds go straight to their group" rule.
  if (isFixed) {
    bandPlayers.forEach((player, i) => {
      placeInGroup(player, targetGroups[i % targetGroups.length], result, currentGroupClubs)
    })
    return
  }

  // Drawn-by-lot band: shuffle player order within the band, then hand out
  // the (fixed) target groups one at a time — preferring, for each player,
  // a still-open target group that doesn't already have a same-club player.
  const shuffledPlayers = shuffle(bandPlayers, rng)
  const available        = targetGroups.slice()

  for (const player of shuffledPlayers) {
    let chosenIdx = 0
    if (player.club) {
      const cleanIdx = available.findIndex(gid => !currentGroupClubs.get(gid)?.has(player.club!))
      if (cleanIdx !== -1) chosenIdx = cleanIdx
    }
    const gid = available.splice(chosenIdx, 1)[0]
    placeInGroup(player, gid, result, currentGroupClubs)
  }
}

function placeInGroup(
  player:            SeedCandidate,
  groupId:           string,
  result:            Map<string, string[]>,
  currentGroupClubs: Map<string, Set<string>>,
): void {
  result.get(groupId)!.push(player.id)
  recordClub(groupId, player.club, currentGroupClubs)
}

/**
 * Club-aware pick for the unseeded fill pass: given a set of eligible
 * groups (already filtered for capacity/tie-break rules by the caller),
 * prefer one without a same-club clash; fall back to the caller's default
 * choice if every eligible group already clashes.
 */
export function pickClubAwareGroup(
  eligibleGroups:    string[],
  club:              string | null,
  currentGroupClubs: Map<string, Set<string>>,
  fallback:          string,
): string {
  if (!club) return fallback
  const clean = eligibleGroups.find(gid => !currentGroupClubs.get(gid)?.has(club))
  return clean ?? fallback
}

export function recordClub(
  groupId:           string,
  club:              string | null,
  currentGroupClubs: Map<string, Set<string>>,
): void {
  if (!club) return
  if (!currentGroupClubs.has(groupId)) currentGroupClubs.set(groupId, new Set())
  currentGroupClubs.get(groupId)!.add(club)
}

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
