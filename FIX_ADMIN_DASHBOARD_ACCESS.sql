-- ================================================================
-- FIX ADMIN DASHBOARD DATA ACCESS
-- Ensures admin users can see ALL data for dashboard
-- ================================================================

-- Create a database function that bypasses RLS for admin dashboard stats
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER -- This allows the function to bypass RLS
AS $$
DECLARE
  result jsonb;
  current_user_role text;
BEGIN
  -- Get current user's role
  SELECT role INTO current_user_role
  FROM users
  WHERE id = auth.uid();
  
  -- Only allow admin role to access this function
  IF current_user_role != 'admin' THEN
    RAISE EXCEPTION 'Access denied: Admin role required';
  END IF;
  
  -- Build comprehensive stats object
  SELECT jsonb_build_object(
    'users', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM users),
      'active', (SELECT COUNT(*) FROM users WHERE status = 'active'),
      'suspended', (SELECT COUNT(*) FROM users WHERE status = 'suspended'),
      'inactive', (SELECT COUNT(*) FROM users WHERE status = 'inactive'),
      'by_role', (
        SELECT jsonb_object_agg(role, count)
        FROM (
          SELECT role, COUNT(*) as count
          FROM users
          GROUP BY role
        ) role_counts
      )
    ),
    'partners', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM partners),
      'active', (SELECT COUNT(*) FROM partners WHERE status = 'active'),
      'onboarding', (SELECT COUNT(*) FROM partners WHERE status = 'onboarding'),
      'paused', (SELECT COUNT(*) FROM partners WHERE status = 'paused'),
      'suspended', (SELECT COUNT(*) FROM partners WHERE status = 'suspended'),
      'high_risk', (SELECT COUNT(*) FROM partners WHERE risk_level = 'high'),
      'by_status', (
        SELECT jsonb_object_agg(status, count)
        FROM (
          SELECT status, COUNT(*) as count
          FROM partners
          GROUP BY status
        ) status_counts
      )
    ),
    'players', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM players),
      'with_ftd', (SELECT COUNT(*) FROM players WHERE ftd_date IS NOT NULL),
      'high_risk', (SELECT COUNT(*) FROM players WHERE risk_score >= 70),
      'total_ngr', (SELECT COALESCE(SUM(ngr), 0) FROM players)
    ),
    'payments', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM payments),
      'pending', (SELECT COUNT(*) FROM payments WHERE status IN ('pending', 'reviewed')),
      'approved', (SELECT COUNT(*) FROM payments WHERE status = 'approved'),
      'paid', (SELECT COUNT(*) FROM payments WHERE status = 'paid'),
      'rejected', (SELECT COUNT(*) FROM payments WHERE status = 'rejected'),
      'pending_amount', (SELECT COALESCE(SUM(total_amount), 0) FROM payments WHERE status IN ('pending', 'reviewed')),
      'approved_amount', (SELECT COALESCE(SUM(total_amount), 0) FROM payments WHERE status = 'approved'),
      'total_paid_amount', (SELECT COALESCE(SUM(total_amount), 0) FROM payments WHERE status = 'paid')
    ),
    'deals', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM deals),
      'open', (SELECT COUNT(*) FROM deals WHERE stage NOT IN ('closed_won', 'closed_lost')),
      'closed_won', (SELECT COUNT(*) FROM deals WHERE stage = 'closed_won'),
      'closed_lost', (SELECT COUNT(*) FROM deals WHERE stage = 'closed_lost'),
      'pipeline_value', (SELECT COALESCE(SUM(amount), 0) FROM deals WHERE stage NOT IN ('closed_won', 'closed_lost')),
      'won_value', (SELECT COALESCE(SUM(amount), 0) FROM deals WHERE stage = 'closed_won')
    ),
    'leads', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM leads),
      'new', (SELECT COUNT(*) FROM leads WHERE status = 'new'),
      'contacted', (SELECT COUNT(*) FROM leads WHERE status = 'contacted'),
      'qualified', (SELECT COUNT(*) FROM leads WHERE status = 'qualified'),
      'converted', (SELECT COUNT(*) FROM leads WHERE status = 'converted'),
      'lost', (SELECT COUNT(*) FROM leads WHERE status = 'lost')
    ),
    'tasks', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM tasks),
      'todo', (SELECT COUNT(*) FROM tasks WHERE status = 'todo'),
      'in_progress', (SELECT COUNT(*) FROM tasks WHERE status = 'in_progress'),
      'done', (SELECT COUNT(*) FROM tasks WHERE status = 'done'),
      'urgent', (SELECT COUNT(*) FROM tasks WHERE priority = 'urgent' AND status != 'done')
    ),
    'security_reviews', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM security_reviews),
      'pending', (SELECT COUNT(*) FROM security_reviews WHERE status = 'pending'),
      'flagged', (SELECT COUNT(*) FROM security_reviews WHERE status = 'flagged'),
      'reviewed', (SELECT COUNT(*) FROM security_reviews WHERE status = 'reviewed'),
      'approved', (SELECT COUNT(*) FROM security_reviews WHERE status = 'approved')
    )
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Grant execute permission to authenticated users (function will check for admin role internally)
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats() TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.get_admin_dashboard_stats() IS 
'Returns comprehensive dashboard statistics for admin users only. Bypasses RLS to show all platform data.';

-- ================================================================
-- TEST THE FUNCTION
-- ================================================================
-- Run this query as admin to verify it works:
-- SELECT get_admin_dashboard_stats();
