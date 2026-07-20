-- v13: Add "Best of 1" match format for table tennis and badminton
--
-- Adds 'bo1' as a valid value to the match_format enum (used by
-- tournaments.format) and to the CHECK constraint on matches.match_format
-- (per-match format override). No default values change — bo1 becomes an
-- additional selectable option alongside bo3 / bo5 / bo7 for both sports.

ALTER TYPE match_format ADD VALUE IF NOT EXISTS 'bo1';

ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_match_format_check;
ALTER TABLE matches ADD CONSTRAINT matches_match_format_check
  CHECK (match_format IN ('bo1', 'bo3', 'bo5', 'bo7'));
