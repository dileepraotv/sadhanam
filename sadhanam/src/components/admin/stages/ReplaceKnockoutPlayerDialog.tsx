'use client'

/**
 * ReplaceKnockoutPlayerDialog
 *
 * Lets an admin substitute a player in an already-generated knockout
 * bracket — e.g. a group runner-up withdraws before their first KO match,
 * and the group's 3rd-place finisher should take the seat instead.
 *
 * Deliberately scoped to matches that haven't started yet (status='pending',
 * no winner) — swapping players mid-tournament or after results exist isn't
 * supported here, since it would raise different questions about existing
 * scores. Reaches for `replaceKnockoutPlayer`, which enforces this server-side.
 *
 * Two-step flow:
 *   1. Pick WHO is being replaced — any player currently seated in a
 *      not-yet-started knockout match.
 *   2. Pick their REPLACEMENT — any tournament player not already seated
 *      elsewhere in the bracket. Players from the same round-robin group as
 *      the outgoing player are surfaced first (ranked by group finish),
 *      since that's the common "next in line" case.
 */

import { useMemo, useState } from 'react'
import { ArrowLeftRight, Repeat, UserX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/index'
import { replaceKnockoutPlayer } from '@/lib/actions/knockout'
import { toast } from '@/components/ui/toaster'
import type { Match, Player } from '@/lib/types'
import type { GroupStandings } from '@/lib/roundrobin/types'

interface Props {
  open:          boolean
  onOpenChange:  (open: boolean) => void
  tournamentId:  string
  koMatches:     Match[]
  players:       Player[]
  rrStandings:   GroupStandings[]
  onDone?:       () => void
}

interface SeatedOption {
  matchId:      string
  playerId:     string
  playerName:   string
  opponentName: string
  roundName:    string
}

export function ReplaceKnockoutPlayerDialog({
  open, onOpenChange, tournamentId, koMatches, players, rrStandings, onDone,
}: Props) {
  const [selected, setSelected]   = useState<SeatedOption | null>(null)
  const [newPlayerId, setNewPlayerId] = useState<string>('')
  const [submitting, setSubmitting]   = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const playerById = useMemo(() => new Map(players.map(p => [p.id, p])), [players])

  // Any player seated in a KO match that hasn't started yet can be replaced.
  const seatedOptions: SeatedOption[] = useMemo(() => {
    const opts: SeatedOption[] = []
    for (const m of koMatches) {
      if (m.status !== 'pending' || m.winner_id) continue
      const p1 = m.player1_id ? playerById.get(m.player1_id) : null
      const p2 = m.player2_id ? playerById.get(m.player2_id) : null
      if (p1) opts.push({ matchId: m.id, playerId: p1.id, playerName: p1.name, opponentName: p2?.name ?? 'TBD', roundName: m.round_name ?? `Round ${m.round}` })
      if (p2) opts.push({ matchId: m.id, playerId: p2.id, playerName: p2.name, opponentName: p1?.name ?? 'TBD', roundName: m.round_name ?? `Round ${m.round}` })
    }
    return opts.sort((a, b) => a.playerName.localeCompare(b.playerName))
  }, [koMatches, playerById])

  // Everyone already seated anywhere in the (non-bye) knockout bracket is off-limits.
  const seatedElsewhere = useMemo(() => {
    const set = new Set<string>()
    for (const m of koMatches) {
      if (m.status === 'bye') continue
      if (m.player1_id) set.add(m.player1_id)
      if (m.player2_id) set.add(m.player2_id)
    }
    return set
  }, [koMatches])

  // Map playerId -> { groupName, rank } from RR standings, to surface
  // "next in line from the same group" candidates first.
  const standingByPlayer = useMemo(() => {
    const map = new Map<string, { groupName: string; rank: number }>()
    for (const { group, standings } of rrStandings) {
      for (const s of standings) map.set(s.playerId, { groupName: group.name, rank: s.rank })
    }
    return map
  }, [rrStandings])

  const outgoingGroup = selected ? standingByPlayer.get(selected.playerId)?.groupName : undefined

  const candidates = useMemo(() => {
    const list = players
      .filter(p => !seatedElsewhere.has(p.id) && p.id !== selected?.playerId)
      .map(p => ({ player: p, info: standingByPlayer.get(p.id) }))

    list.sort((a, b) => {
      const aSameGroup = outgoingGroup && a.info?.groupName === outgoingGroup
      const bSameGroup = outgoingGroup && b.info?.groupName === outgoingGroup
      if (aSameGroup && !bSameGroup) return -1
      if (!aSameGroup && bSameGroup) return 1
      if (aSameGroup && bSameGroup) return (a.info!.rank) - (b.info!.rank)
      return a.player.name.localeCompare(b.player.name)
    })
    return list
  }, [players, seatedElsewhere, selected, standingByPlayer, outgoingGroup])

  const reset = () => { setSelected(null); setNewPlayerId(''); setError(null) }

  const handleClose = (v: boolean) => {
    if (submitting) return
    if (!v) reset()
    onOpenChange(v)
  }

  const handleConfirm = async () => {
    if (!selected || !newPlayerId) return
    setSubmitting(true)
    setError(null)
    const result = await replaceKnockoutPlayer(selected.matchId, tournamentId, selected.playerId, newPlayerId)
    setSubmitting(false)
    if (result.error) {
      setError(result.error)
      return
    }
    const incoming = playerById.get(newPlayerId)
    toast({
      title: 'Player replaced',
      description: `${incoming?.name ?? 'New player'} now takes ${selected.playerName}'s seat vs ${selected.opponentName}.`,
    })
    reset()
    onOpenChange(false)
    onDone?.()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-base">
            <div className="h-8 w-8 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
              <ArrowLeftRight className="h-4 w-4 text-orange-500" />
            </div>
            Replace a Knockout Player
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            For a player who withdrew or retired before their knockout match started.
            Only matches that haven&apos;t begun yet can be edited this way.
          </p>

          {seatedOptions.length === 0 ? (
            <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground flex items-center gap-2">
              <UserX className="h-4 w-4 shrink-0" />
              No knockout matches are pending replacement — every match has either started or has no players seated yet.
            </div>
          ) : (
            <>
              {/* Step 1: who is withdrawing */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Player withdrawing
                </label>
                <select
                  className="field-base text-sm"
                  value={selected ? `${selected.matchId}:${selected.playerId}` : ''}
                  onChange={e => {
                    const [matchId, playerId] = e.target.value.split(':')
                    const opt = seatedOptions.find(o => o.matchId === matchId && o.playerId === playerId) ?? null
                    setSelected(opt)
                    setNewPlayerId('')
                    setError(null)
                  }}
                >
                  <option value="">Select a player…</option>
                  {seatedOptions.map(o => (
                    <option key={`${o.matchId}:${o.playerId}`} value={`${o.matchId}:${o.playerId}`}>
                      {o.playerName} ({o.roundName} vs {o.opponentName})
                    </option>
                  ))}
                </select>
              </div>

              {/* Step 2: replacement */}
              {selected && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Replace with
                  </label>
                  <select
                    className="field-base text-sm"
                    value={newPlayerId}
                    onChange={e => { setNewPlayerId(e.target.value); setError(null) }}
                  >
                    <option value="">Select a replacement…</option>
                    {candidates.map(({ player, info }) => (
                      <option key={player.id} value={player.id}>
                        {player.name}
                        {info && info.groupName === outgoingGroup ? ` — ${info.groupName}, rank ${info.rank}` : info ? ` — ${info.groupName}` : ''}
                      </option>
                    ))}
                  </select>
                  {outgoingGroup && (
                    <p className="text-[11px] text-muted-foreground">
                      Players from <strong className="text-foreground">{outgoingGroup}</strong> are listed first, ranked by their group finish.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {error && (
            <p className="text-sm text-destructive font-medium">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <Button variant="outline" onClick={() => handleClose(false)} disabled={submitting} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={submitting || !selected || !newPlayerId}
              className={cn('flex-1')}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  Replacing…
                </span>
              ) : (
                <>
                  <Repeat className="h-4 w-4" />
                  Replace Player
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
