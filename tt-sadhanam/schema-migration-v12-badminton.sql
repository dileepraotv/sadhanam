-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration v12: Badminton support (sport_type + team cup formats)
-- Run this in Supabase SQL Editor ONCE.
-- Safe to re-run: all statements are idempotent.
--
-- Scope: adds a sport_type discriminator to tournaments (default 'table_tennis',
-- so every existing row is explicitly unaffected), and three new format_type
-- values for badminton team cup events (Thomas / Uber / Sudirman). No new
-- tables are introduced — badminton reuses players/matches/games/stages/teams
-- exactly as table tennis does; only the scoring thresholds and submatch label
-- sets differ, both handled at the application layer.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. sport_type enum + column on tournaments ──────────────────────────────
DO $$ BEGIN
  CREATE TYPE sport_type AS ENUM ('table_tennis', 'badminton');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS sport_type sport_type NOT NULL DEFAULT 'table_tennis';

-- Note: championships intentionally does NOT get a sport_type column — a
-- championship is a sport-agnostic container of events; each tournament
-- (event) carries its own sport_type. This also means every pre-existing
-- tournament row is explicitly and unambiguously 'table_tennis' after this
-- migration — no backfill script needed, no null/ambiguous state possible.

-- ── 2. New format_type values for badminton team cup events ────────────────
DO $$ BEGIN
  ALTER TYPE tournament_format_type ADD VALUE IF NOT EXISTS 'team_thomas';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE tournament_format_type ADD VALUE IF NOT EXISTS 'team_uber';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE tournament_format_type ADD VALUE IF NOT EXISTS 'team_sudirman';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── 3. Index for sport-based filtering (admin dashboard, public home page) ──
CREATE INDEX IF NOT EXISTS tournaments_sport_type_idx ON tournaments (sport_type);
