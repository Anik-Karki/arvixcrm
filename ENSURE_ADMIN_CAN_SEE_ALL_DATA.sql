-- ================================================================
-- ENSURE ADMIN ROLE CAN SEE ALL DATA
-- Fixes RLS policies to allow admin full read access
-- ================================================================

-- Drop and recreate RLS policies for admin to see ALL data on key tables

-- ============================================================
-- USERS TABLE
-- ============================================================
DROP POLICY IF EXISTS "admin_read_all_users" ON users;
CREATE POLICY "admin_read_all_users"
ON users FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role = 'admin'
  )
);

-- ============================================================
-- PARTNERS TABLE
-- ============================================================
DROP POLICY IF EXISTS "admin_read_all_partners" ON partners;
CREATE POLICY "admin_read_all_partners"
ON partners FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role = 'admin'
  )
);

-- ============================================================
-- PLAYERS TABLE
-- ============================================================
DROP POLICY IF EXISTS "admin_read_all_players" ON players;
CREATE POLICY "admin_read_all_players"
ON players FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role = 'admin'
  )
);

-- ============================================================
-- PAYMENTS TABLE
-- ============================================================
DROP POLICY IF EXISTS "admin_read_all_payments" ON payments;
CREATE POLICY "admin_read_all_payments"
ON payments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role = 'admin'
  )
);

-- ============================================================
-- DEALS TABLE
-- ============================================================
DROP POLICY IF EXISTS "admin_read_all_deals" ON deals;
CREATE POLICY "admin_read_all_deals"
ON deals FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role = 'admin'
  )
);

-- ============================================================
-- LEADS TABLE
-- ============================================================
DROP POLICY IF EXISTS "admin_read_all_leads" ON leads;
CREATE POLICY "admin_read_all_leads"
ON leads FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role = 'admin'
  )
);

-- ============================================================
-- TASKS TABLE
-- ============================================================
DROP POLICY IF EXISTS "admin_read_all_tasks" ON tasks;
CREATE POLICY "admin_read_all_tasks"
ON tasks FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role = 'admin'
  )
);

-- ============================================================
-- SECURITY_REVIEWS TABLE
-- ============================================================
DROP POLICY IF EXISTS "admin_read_all_security_reviews" ON security_reviews;
CREATE POLICY "admin_read_all_security_reviews"
ON security_reviews FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role = 'admin'
  )
);

-- ============================================================
-- ACTIVITY_LOGS TABLE
-- ============================================================
DROP POLICY IF EXISTS "admin_read_all_activity_logs" ON activity_logs;
CREATE POLICY "admin_read_all_activity_logs"
ON activity_logs FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role = 'admin'
  )
);

-- ============================================================
-- VERIFY POLICIES
-- ============================================================
SELECT 
  'RLS Policies for Admin' as info,
  schemaname,
  tablename,
  policyname,
  permissive,
  cmd as command
FROM pg_policies
WHERE policyname LIKE 'admin_read_all_%'
ORDER BY tablename;

-- ============================================================
-- TEST QUERIES (run as admin user)
-- ============================================================
-- SELECT 'Users' as table_name, COUNT(*) as count FROM users;
-- SELECT 'Partners' as table_name, COUNT(*) as count FROM partners;
-- SELECT 'Players' as table_name, COUNT(*) as count FROM players;
-- SELECT 'Payments' as table_name, COUNT(*) as count FROM payments;
-- SELECT 'Deals' as table_name, COUNT(*) as count FROM deals;
-- SELECT 'Leads' as table_name, COUNT(*) as count FROM leads;
-- SELECT 'Tasks' as table_name, COUNT(*) as count FROM tasks;
-- SELECT 'Security Reviews' as table_name, COUNT(*) as count FROM security_reviews;
