// src/supabase.js
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase. Note: The user MUST provide these in the .env file!
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function fetchProfile(authId) {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("auth_id", authId)
    .maybeSingle();
    
  if (error) throw error;
  return data;
}

export async function fetchMembers() {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchContributions(year = null) {
  let query = supabase.from("contributions").select("*");
  if (year) {
    query = query.eq("year", year);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * Returns the TRUE total of all contributions across all members & years.
 * Uses a SECURITY DEFINER Postgres function so RLS does not restrict the result.
 *
 * One-time setup - run this SQL once in your Supabase SQL Editor:
 *
 *   CREATE OR REPLACE FUNCTION get_total_funds()
 *   RETURNS numeric LANGUAGE sql SECURITY DEFINER AS $$
 *     SELECT COALESCE(SUM(amount), 0) FROM contributions;
 *   $$;
 *   GRANT EXECUTE ON FUNCTION get_total_funds() TO authenticated;
 */
export async function fetchTotalFunds() {
  const { data, error } = await supabase.rpc('get_total_funds');
  if (error) {
    if (import.meta.env.DEV) console.warn('fetchTotalFunds RPC not found - run the SQL setup. Falling back to 0.', error.message);
    return null; // null = caller will fall back to local calculation
  }
  return Number(data ?? 0);
}

/**
 * Returns the TRUE total interest across ALL chama loans (bypasses RLS).
 * Mirrors the JS calculateLoanInterest() logic in SQL.
 *
 * One-time setup - run this SQL once in your Supabase SQL Editor:
 *
 *   CREATE OR REPLACE FUNCTION get_total_loan_interest()
 *   RETURNS numeric LANGUAGE sql SECURITY DEFINER AS $$
 *     SELECT COALESCE(SUM(
 *       CASE
 *         WHEN due_date IS NULL THEN
 *           CASE WHEN interest_type = 'reducing_12'
 *             THEN amount * 0.12
 *             ELSE amount * COALESCE(interest_rate, 0.10)
 *           END
 *         ELSE
 *           CASE WHEN interest_type = 'reducing_12'
 *             THEN amount * 0.12 * GREATEST(1, ROUND(
 *                  EXTRACT(EPOCH FROM (due_date::date - COALESCE(approval_date, date)::date)) / 2592000))
 *             ELSE amount * COALESCE(interest_rate, 0.10) * GREATEST(1, ROUND(
 *                  EXTRACT(EPOCH FROM (due_date::date - COALESCE(approval_date, date)::date)) / 2592000))
 *           END
 *       END
 *     ), 0)
 *     FROM loans
 *     WHERE status != 'pending';
 *   $$;
 *   GRANT EXECUTE ON FUNCTION get_total_loan_interest() TO authenticated;
 */
export async function fetchTotalLoanInterest() {
  const { data, error } = await supabase.rpc('get_total_loan_interest');
  if (error) {
    if (import.meta.env.DEV) console.warn('fetchTotalLoanInterest RPC not found - run the SQL setup. Falling back to null.', error.message);
    return null; // null = caller falls back to local calculation
  }
  return Number(data ?? 0);
}

export async function fetchLoans() {
  const { data, error } = await supabase
    .from("loans")
    .select("*")
    .order("date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createMember(memberData) {
  if (!memberData.name || !memberData.phone) throw new Error('Name and phone are required');
  const { data, error } = await supabase
    .from("members")
    .insert([memberData])
    .select()
    .single();
    
  if (error) throw error;
  return data;
}

export async function updateMember(id, updates) {
  if (!id) throw new Error('Member ID is required');
  const { data, error } = await supabase
    .from("members")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
    
  if (error) throw error;
  return data;
}

export async function deleteMember(id) {
  const { error } = await supabase
    .from("members")
    .delete()
    .eq("id", id);
    
  if (error) throw error;
}

export async function createLoan(loanData) {
  if (!loanData.amount || loanData.amount <= 0 || loanData.amount > 100000000) throw new Error('Invalid loan amount');
  const { data, error } = await supabase
    .from("loans")
    .insert([loanData])
    .select()
    .single();
    
  if (error) throw error;
  return data;
}

export async function updateLoan(id, updates) {
  const { data, error } = await supabase
    .from("loans")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
    
  if (error) {
    if (import.meta.env.DEV) console.error("updateLoan error:", error, "Payload:", updates);
    throw error;
  }
  return data;
}

export async function safeAddRepayment(loanId, amount, totalOwed) {
  // Atomic repayment via PostgreSQL function - prevents race conditions
  const { data, error } = await supabase.rpc('safe_add_repayment', {
    p_loan_id: loanId,
    p_amount: amount,
    p_total_owed: totalOwed,
  });
  if (error) throw error;
  return data; // { id, paid, status, repaid_at }
}

export async function upsertContribution(memberId, month, year, amount, userId) {
  const { data: existing, error: fetchErr } = await supabase
    .from("contributions")
    .select("id")
    .eq("member_id", memberId)
    .eq("month", month)
    .eq("year", year)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
    
  if (existing) {
    const { error } = await supabase.from("contributions").update({ amount }).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("contributions").insert([{ member_id: memberId, month, year, amount }]);
    if (error) throw error;
  }
}

const CHAMA_START_YEAR = 2025; // Records should not predate this year

export async function distributeContribution(memberId, totalAmount, selMonth, selYear, userId, shouldDistribute, monthlyTarget, months) {
  // Reject contributions for years before the chama start year
  if (selYear < CHAMA_START_YEAR) {
    throw new Error(`Contributions cannot be recorded before ${CHAMA_START_YEAR}.`);
  }

  if (!shouldDistribute) {
    return await upsertContribution(memberId, selMonth, selYear, totalAmount, userId);
  }

  // 1. Fetch history for current and previous year (but never before CHAMA_START_YEAR)
  const prevYear = selYear - 1;
  const yearsToFetch = prevYear >= CHAMA_START_YEAR ? [prevYear, selYear] : [selYear];

  const { data: history, error: hErr } = await supabase
    .from("contributions")
    .select("*")
    .eq("member_id", memberId)
    .in("year", yearsToFetch);

  if (hErr) throw hErr;

  const getAmount = (m, y) => history.find(c => c.month === m && c.year === y)?.amount || 0;
  let remaining = totalAmount;

  // 2. Priority: Fill the selected month first
  const currentSel = getAmount(selMonth, selYear);
  const selGap = Math.max(0, monthlyTarget - currentSel);
  const fillSel = Math.min(remaining, selGap);
  if (fillSel > 0) {
    await upsertContribution(memberId, selMonth, selYear, currentSel + fillSel, userId);
    remaining -= fillSel;
  }

  if (remaining <= 0) return;

  // 3. Look Back: Fill arrears (Previous Year [>= CHAMA_START_YEAR] -> Current Year up to selected month)
  const selIdx = months.indexOf(selMonth);
  const backSchedule = [];

  // Only include previous year in backfill if it's within valid range
  if (prevYear >= CHAMA_START_YEAR) {
    months.forEach(m => backSchedule.push({ month: m, year: prevYear }));
  }
  months.slice(0, selIdx).forEach(m => backSchedule.push({ month: m, year: selYear }));

  for (const item of backSchedule) {
    if (remaining <= 0) break;
    const cur = getAmount(item.month, item.year);
    if (cur < monthlyTarget) {
      const gap = monthlyTarget - cur;
      const fill = Math.min(remaining, gap);
      await upsertContribution(memberId, item.month, item.year, cur + fill, userId);
      remaining -= fill;
    }
  }

  // 4. Look Forward: Fill future months of the current year (after selected month)
  if (remaining > 0) {
    const forwardSchedule = months.slice(selIdx + 1).map(m => ({ month: m, year: selYear }));
    for (const item of forwardSchedule) {
      if (remaining <= 0) break;
      const cur = getAmount(item.month, item.year);
      if (cur < monthlyTarget) {
        const gap = monthlyTarget - cur;
        const fill = Math.min(remaining, gap);
        await upsertContribution(memberId, item.month, item.year, cur + fill, userId);
        remaining -= fill;
      }
    }
  }

  // 5. Final Remainder: If money STILL remains, add it back to the selected month as surplus
  //    Re-read the latest value from DB to avoid overwriting concurrent changes.
  if (remaining > 0) {
    const { data: final } = await supabase
      .from("contributions")
      .select("amount")
      .eq("member_id", memberId)
      .eq("month", selMonth)
      .eq("year", selYear)
      .single();
    const latestAmount = final?.amount ?? 0;
    await upsertContribution(memberId, selMonth, selYear, latestAmount + remaining, userId);
  }
}

export async function bulkUpsertContributions(updates) {
  // updates: [{ member_id, month, year, amount }, ...]
  const { data, error } = await supabase
    .from("contributions")
    .upsert(updates, { onConflict: "member_id,month,year" });
    
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.reload();
}

export async function updatePasswordTimestamp(authId) {
  try {
    const { error } = await supabase
      .from("members")
      .update({ password_changed_at: new Date().toISOString() })
      .eq("auth_id", authId);
    if (error && import.meta.env.DEV) console.warn("Could not update password timestamp. Ensure SQL migration has been run.", error);
  } catch (err) {
    if (import.meta.env.DEV) console.warn("Silent failure updating password timestamp:", err);
  }
}

