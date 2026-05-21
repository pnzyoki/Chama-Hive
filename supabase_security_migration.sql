-- ============================================================================
-- ChamaHive Security Migration
-- Run this ONCE in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================================

-- ─── 1. Helper: Get current user's role ─────────────────────────────────────
-- SECURITY DEFINER so it can read the members table even with RLS enabled.
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM members WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: Check if current user has a privileged role
CREATE OR REPLACE FUNCTION is_privileged()
RETURNS BOOLEAN AS $$
  SELECT get_my_role() IN ('admin', 'treasurer', 'chairman');
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ─── 2. Enable RLS on all tables ────────────────────────────────────────────
ALTER TABLE members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans         ENABLE ROW LEVEL SECURITY;


-- ─── 3. Members table RLS policies ──────────────────────────────────────────

-- Drop any existing policies to avoid conflicts
DROP POLICY IF EXISTS "members_select" ON members;
DROP POLICY IF EXISTS "members_insert" ON members;
DROP POLICY IF EXISTS "members_update" ON members;
DROP POLICY IF EXISTS "members_delete" ON members;

-- SELECT: Privileged users see all; regular members see only their own row
CREATE POLICY "members_select" ON members
  FOR SELECT TO authenticated
  USING (
    auth_id = auth.uid()
    OR is_privileged()
  );

-- INSERT: Admins can create members; users can self-register (auth_id = own)
CREATE POLICY "members_insert" ON members
  FOR INSERT TO authenticated
  WITH CHECK (
    auth_id = auth.uid()
    OR get_my_role() = 'admin'
  );

-- UPDATE: Admins can update any member; members can update only their own row
-- (Role changes are further restricted by the trigger below)
CREATE POLICY "members_update" ON members
  FOR UPDATE TO authenticated
  USING (
    auth_id = auth.uid()
    OR get_my_role() = 'admin'
  )
  WITH CHECK (
    auth_id = auth.uid()
    OR get_my_role() = 'admin'
  );

-- DELETE: Only admins can delete members
CREATE POLICY "members_delete" ON members
  FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');


-- ─── 4. Role escalation prevention trigger ──────────────────────────────────
-- Prevents non-admin users from changing the 'role' column on any member row.

CREATE OR REPLACE FUNCTION prevent_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
  -- If the role column is being changed...
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    -- ...only admins are allowed to do so
    IF get_my_role() != 'admin' THEN
      RAISE EXCEPTION 'Permission denied: only admins can change member roles';
    END IF;
  END IF;
  
  -- Prevent non-admins from changing another user's status
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF get_my_role() NOT IN ('admin', 'chairman') THEN
      RAISE EXCEPTION 'Permission denied: only admins and chairmen can change member status';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS check_role_change ON members;
CREATE TRIGGER check_role_change
  BEFORE UPDATE ON members
  FOR EACH ROW
  EXECUTE FUNCTION prevent_role_escalation();


-- ─── 5. Contributions table RLS policies ────────────────────────────────────

DROP POLICY IF EXISTS "contributions_select" ON contributions;
DROP POLICY IF EXISTS "contributions_insert" ON contributions;
DROP POLICY IF EXISTS "contributions_update" ON contributions;
DROP POLICY IF EXISTS "contributions_delete" ON contributions;

-- SELECT: Privileged see all; members see only their own
CREATE POLICY "contributions_select" ON contributions
  FOR SELECT TO authenticated
  USING (
    member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
    OR is_privileged()
  );

-- INSERT: Only admins and treasurers can insert contributions
CREATE POLICY "contributions_insert" ON contributions
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() IN ('admin', 'treasurer')
  );

-- UPDATE: Only admins and treasurers can update contributions
CREATE POLICY "contributions_update" ON contributions
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin', 'treasurer'))
  WITH CHECK (get_my_role() IN ('admin', 'treasurer'));

-- DELETE: Only admins can delete contributions
CREATE POLICY "contributions_delete" ON contributions
  FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');


-- ─── 6. Loans table RLS policies ────────────────────────────────────────────

DROP POLICY IF EXISTS "loans_select" ON loans;
DROP POLICY IF EXISTS "loans_insert" ON loans;
DROP POLICY IF EXISTS "loans_update" ON loans;
DROP POLICY IF EXISTS "loans_delete" ON loans;

-- SELECT: Privileged see all loans; members see only their own
CREATE POLICY "loans_select" ON loans
  FOR SELECT TO authenticated
  USING (
    member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
    OR is_privileged()
  );

-- INSERT: Any authenticated user can request a loan for themselves
CREATE POLICY "loans_insert" ON loans
  FOR INSERT TO authenticated
  WITH CHECK (
    member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
  );

-- UPDATE: Admins/chairmen can update any loan; members can only modify their own PENDING loans
CREATE POLICY "loans_update" ON loans
  FOR UPDATE TO authenticated
  USING (
    get_my_role() IN ('admin', 'chairman')
    OR (
      member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
      AND status = 'pending'
    )
  )
  WITH CHECK (
    get_my_role() IN ('admin', 'chairman')
    OR (
      member_id IN (SELECT id FROM members WHERE auth_id = auth.uid())
      AND status = 'pending'
    )
  );

-- DELETE: Only admins can delete loans
CREATE POLICY "loans_delete" ON loans
  FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');


-- ─── 7. Atomic loan repayment function ──────────────────────────────────────
-- Replaces the read-then-write pattern with a single atomic operation.
-- Accepts the total_owed from the client (principal + interest) so the
-- interest calculation stays consistent with the frontend logic.

CREATE OR REPLACE FUNCTION safe_add_repayment(
  p_loan_id UUID,
  p_amount NUMERIC,
  p_total_owed NUMERIC
)
RETURNS JSON AS $$
DECLARE
  v_loan   RECORD;
  v_new_paid   NUMERIC;
  v_new_status TEXT;
BEGIN
  -- Validate amount
  IF p_amount <= 0 OR p_amount > 100000000 THEN
    RAISE EXCEPTION 'Invalid repayment amount: must be between 0 and 100,000,000';
  END IF;

  -- Lock the row to prevent concurrent modification
  SELECT * INTO v_loan FROM loans WHERE id = p_loan_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;

  IF v_loan.status != 'active' THEN
    RAISE EXCEPTION 'Can only repay active loans';
  END IF;

  -- Atomically compute new paid amount
  v_new_paid := COALESCE(v_loan.paid, 0) + p_amount;

  -- Determine new status based on client-provided total owed
  IF v_new_paid >= p_total_owed THEN
    v_new_status := 'completed';
  ELSE
    v_new_status := 'active';
  END IF;

  -- Single atomic update
  UPDATE loans SET
    paid      = v_new_paid,
    status    = v_new_status,
    repaid_at = CASE WHEN v_new_status = 'completed' THEN NOW() ELSE repaid_at END
  WHERE id = p_loan_id;

  -- Return the result so the frontend can update local state
  RETURN json_build_object(
    'id',        p_loan_id,
    'paid',      v_new_paid,
    'status',    v_new_status,
    'repaid_at', CASE WHEN v_new_status = 'completed' THEN NOW() ELSE NULL END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION safe_add_repayment(UUID, NUMERIC, NUMERIC) TO authenticated;


-- ─── 8. Database-level constraints ──────────────────────────────────────────
-- Defense-in-depth: prevent invalid data even if frontend validation is bypassed.

DO $$ BEGIN
  ALTER TABLE contributions ADD CONSTRAINT contributions_amount_nonnegative
    CHECK (amount >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE loans ADD CONSTRAINT loans_amount_valid
    CHECK (amount > 0 AND amount <= 100000000);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE members ADD CONSTRAINT members_role_valid
    CHECK (role IN ('admin', 'treasurer', 'chairman', 'member'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE members ADD CONSTRAINT members_status_valid
    CHECK (status IN ('approved', 'pending', 'rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─── 9. Grant execute on existing RPC functions ─────────────────────────────
-- Ensure the aggregate functions are available (these may already be set up)

GRANT EXECUTE ON FUNCTION get_my_role()    TO authenticated;
GRANT EXECUTE ON FUNCTION is_privileged()  TO authenticated;


-- ============================================================================
-- ✅ MIGRATION COMPLETE
-- 
-- What was applied:
--   1. RLS enabled on: members, contributions, loans
--   2. Fine-grained SELECT/INSERT/UPDATE/DELETE policies on all tables
--   3. Role escalation prevention trigger (only admins can change roles)
--   4. Status change restriction (only admins/chairmen can change status)
--   5. Atomic loan repayment function (safe_add_repayment)
--   6. Database constraints for data integrity
--
-- IMPORTANT: Verify your admin user exists and has role = 'admin' BEFORE
-- running this migration, otherwise you may lock yourself out.
-- ============================================================================
