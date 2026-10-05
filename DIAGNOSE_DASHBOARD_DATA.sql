-- ================================================================
-- DIAGNOSE DASHBOARD DATA ACCESS FOR ADMIN
-- Run this in Supabase SQL Editor while logged in as admin
-- ================================================================

-- 1. Check what data actually exists in database
SELECT 'Total Partners in DB' as check_name, COUNT(*) as count FROM partners;
SELECT 'Active Partners in DB' as check_name, COUNT(*) as count FROM partners WHERE status = 'active';
SELECT 'Total Players in DB' as check_name, COUNT(*) as count FROM players;
SELECT 'Players with FTD' as check_name, COUNT(*) as count FROM players WHERE ftd_date IS NOT NULL;
SELECT 'Total Users in DB' as check_name, COUNT(*) as count FROM users;
SELECT 'Active Users in DB' as check_name, COUNT(*) as count FROM users WHERE status = 'active';
SELECT 'Total Payments in DB' as check_name, COUNT(*) as count FROM payments;
SELECT 'Paid Payments in DB' as check_name, COUNT(*) as count FROM payments WHERE status = 'paid';
SELECT 'Total Paid Amount' as check_name, COALESCE(SUM(total_amount), 0) as count FROM payments WHERE status = 'paid';
SELECT 'Total Deals in DB' as check_name, COUNT(*) as count FROM deals;
SELECT 'Open Deals in DB' as check_name, COUNT(*) as count FROM deals WHERE stage NOT IN ('closed_won', 'closed_lost');
SELECT 'Open Deals Value' as check_name, COALESCE(SUM(amount), 0) as count FROM deals WHERE stage NOT IN ('closed_won', 'closed_lost');
SELECT 'Total Leads in DB' as check_name, COUNT(*) as count FROM leads;
SELECT 'New Leads in DB' as check_name, COUNT(*) as count FROM leads WHERE status = 'new';
SELECT 'Total Tasks in DB' as check_name, COUNT(*) as count FROM tasks;
SELECT 'Open Tasks in DB' as check_name, COUNT(*) as count FROM tasks WHERE status IN ('todo', 'in_progress');
SELECT 'Total Security Reviews' as check_name, COUNT(*) as count FROM security_reviews;
SELECT 'Pending Security Reviews' as check_name, COUNT(*) as count FROM security_reviews WHERE status = 'pending';

-- 2. Check current user's role and ID
SELECT 
  'Current User Info' as info,
  auth.uid() as user_id,
  u.role,
  u.status,
  u.email
FROM users u
WHERE u.id = auth.uid();

-- 3. Test RLS policies - can admin see all partners?
SELECT 
  'Partners Admin Can See' as check_name,
  COUNT(*) as count
FROM partners;

-- 4. Test if RLS is blocking data
SELECT 
  'RLS Policies on Partners Table' as check_name,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'partners';

-- 5. Show sample partner data with all fields
SELECT 
  id,
  name,
  status,
  partner_type,
  risk_level,
  created_at,
  created_by
FROM partners
LIMIT 5;

-- 6. Check if service role bypass is needed
-- If RLS is preventing admin access, we need to fix policies
SELECT 
  'Checking RLS Bypass Status' as info,
  current_setting('request.jwt.claims', true)::json->>'role' as jwt_role,
  current_setting('role') as db_role;
