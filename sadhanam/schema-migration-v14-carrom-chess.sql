-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration v14: Carrom + Chess support (sport_type extension, draws, doubles pairs)
-- Run this in Supabase SQL Editor ONCE.
-- Safe to re-run: all statements are idempotent.
--
-- Scope:
--   1. sport_type enum grows to include 'carrom' and 'chess'.
--   2. Chess needs draws, which no existing sport has — adds is_draw to games
--      and matches (NULL/false everywhere until a drawn game/match is scored).
--   3. Carrom "boards" are scored as (winner, points 0-12), not two-sided rally
--      scores, and a carrom match is decided by reaching a point target over a
--      capped number of boards (not "best of N games won") — adds per-tournament
--      carrom config columns instead of overloading match_format.
--   4. Carrom doubles is modeled as a "pair entrant": a normal players row with
--      an optional partner_name, so every existing bracket/round-robin/standings/
--      scoring code path works unchanged for doubles — no new tables needed.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. sport_type enum: add carrom + chess ──────────────────────────────────
DO $$ BEGIN
    10|  ALTER TYPE sport_type ADD VALUE IF NOT EXISTS 'carrom';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE sport_type ADD VALUE IF NOT EXISTS 'chess';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── 2. Draw support (chess; harmless no-op for every other sport) ──────────
    20|ALTER TABLE games   ADD COLUMN IF NOT EXISTS is_draw BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS is_draw BOOLEAN NOT NULL DEFAULT false;

-- A drawn game/match still has winner_id = NULL, same as "not yet decided" —
-- is_draw is what disambiguates "drawn" from "pending". Guard against a row
-- claiming both a winner AND a draw.
ALTER TABLE games   DROP CONSTRAINT IF EXISTS games_draw_no_winner;
ALTER TABLE games   ADD  CONSTRAINT games_draw_no_winner
  CHECK (NOT (is_draw AND winner_id IS NOT NULL));

    30|ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_draw_no_winner;
ALTER TABLE matches ADD  CONSTRAINT matches_draw_no_winner
  CHECK (NOT (is_draw AND winner_id IS NOT NULL));

-- ── 3. Carrom match-completion config (per tournament, organizer-configurable) ─
-- ICF official default: 25 points, 8 boards, queen = 3. Common club variant:
-- 29 points, 4 boards, queen = 5. Deliberately NOT hardcoded — exposed as an
-- event setting in NewEventForm so organizers can pick either (or a custom mix).
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS carrom_board_target SMALLINT  NOT NULL DEFAULT 25
    40|  CONSTRAINT carrom_board_target_range CHECK (carrom_board_target BETWEEN 1 AND 99);
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS carrom_queen_value   SMALLINT  NOT NULL DEFAULT 3
  CONSTRAINT carrom_queen_value_range CHECK (carrom_queen_value BETWEEN 1 AND 10);
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS carrom_max_boards    SMALLINT  NOT NULL DEFAULT 8
  CONSTRAINT carrom_max_boards_range CHECK (carrom_max_boards BETWEEN 1 AND 20);

-- ── 4. Doubles-pair entrant (carrom doubles today; reusable for any sport) ──
-- A "pair" is just a normal players row with a second name attached. Every
-- existing bracket/RR/standings/scoring path treats it as one opaque entrant —
-- display code renders "name / partner_name" wherever a player name appears.
    50|ALTER TABLE players     ADD COLUMN IF NOT EXISTS partner_name TEXT NULL;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS is_doubles   BOOLEAN NOT NULL DEFAULT false;

-- ── 5. Indexes ───────────────────────────────────────────────────────────────
-- sport_type index already exists from v12 (tournaments_sport_type_idx) and
-- covers carrom/chess automatically — no new index needed.
