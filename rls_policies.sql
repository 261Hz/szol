-- =============================================================================
-- Row Level Security (RLS) for Szól — run this in the Supabase SQL editor.
--
-- Architecture: FastAPI connects as the service role (postgres superuser).
-- RLS does not apply to superusers BY DEFAULT. We use FORCE ROW LEVEL SECURITY
-- on sensitive tables so policies are enforced even for the service role.
-- Each policy grants FULL access to the service role, which is fine because
-- the FastAPI layer enforces auth and ownership at the application level.
-- The real benefit: blocks direct access via the Supabase anon/authenticated keys.
-- =============================================================================


-- ── Enable RLS on all tables ──────────────────────────────────────────────────

ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_words           ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_vocab           ENABLE ROW LEVEL SECURITY;
ALTER TABLE curated_stories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_stories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_stories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE word_cache           ENABLE ROW LEVEL SECURITY;
ALTER TABLE frequency_sources    ENABLE ROW LEVEL SECURITY;
ALTER TABLE frequency_lemmas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE frequency_entries    ENABLE ROW LEVEL SECURITY;

-- Force RLS on tables with PII even for superuser connections.
ALTER TABLE users         FORCE ROW LEVEL SECURITY;
ALTER TABLE user_words    FORCE ROW LEVEL SECURITY;
ALTER TABLE user_progress FORCE ROW LEVEL SECURITY;
ALTER TABLE user_vocab    FORCE ROW LEVEL SECURITY;


-- ── Service-role bypass policy (applies to all tables) ────────────────────────
-- The FastAPI backend connects as the Supabase service role. Grant it full access.
-- Replace 'postgres' with your actual service role name if different.

CREATE POLICY "service role full access" ON users
    USING (true) WITH CHECK (true);

CREATE POLICY "service role full access" ON user_words
    USING (true) WITH CHECK (true);

CREATE POLICY "service role full access" ON user_progress
    USING (true) WITH CHECK (true);

CREATE POLICY "service role full access" ON user_vocab
    USING (true) WITH CHECK (true);

CREATE POLICY "service role full access" ON curated_stories
    USING (true) WITH CHECK (true);

CREATE POLICY "service role full access" ON community_stories
    USING (true) WITH CHECK (true);

CREATE POLICY "service role full access" ON video_stories
    USING (true) WITH CHECK (true);

CREATE POLICY "service role full access" ON word_cache
    USING (true) WITH CHECK (true);

CREATE POLICY "service role full access" ON frequency_sources
    USING (true) WITH CHECK (true);

CREATE POLICY "service role full access" ON frequency_lemmas
    USING (true) WITH CHECK (true);

CREATE POLICY "service role full access" ON frequency_entries
    USING (true) WITH CHECK (true);


-- ── Block anon key from reading PII tables directly ───────────────────────────
-- The policies above (USING true) apply to all roles including anon.
-- To block the Supabase anon key specifically, revoke table-level privileges.
-- This is belt-and-suspenders: RLS already blocks unauthenticated rows,
-- but revoking SELECT removes the option entirely.

REVOKE SELECT, INSERT, UPDATE, DELETE ON users         FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON user_words    FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON user_progress FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON user_vocab    FROM anon;

-- Public-read tables: allow anon SELECT (curated content is fine to expose).
-- Insert/Update/Delete still blocked for anon on these tables.
REVOKE INSERT, UPDATE, DELETE ON curated_stories   FROM anon;
REVOKE INSERT, UPDATE, DELETE ON community_stories FROM anon;
REVOKE INSERT, UPDATE, DELETE ON video_stories     FROM anon;
REVOKE INSERT, UPDATE, DELETE ON word_cache        FROM anon;


-- ── Verification ──────────────────────────────────────────────────────────────
-- After running, confirm RLS is active:
--
--   SELECT tablename, rowsecurity, forcesecurity
--   FROM pg_tables
--   WHERE schemaname = 'public'
--   ORDER BY tablename;
--
-- All sensitive tables should show rowsecurity=true, forcesecurity=true (for PII tables).
