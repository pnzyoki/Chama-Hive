// src/supabase.js
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase. Note: The user MUST provide these in the .env file!
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://your-project.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhb...";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function fetchProfile(authId) {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("auth_id", authId)
    .single();
    
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

export async function fetchLoans() {
  const { data, error } = await supabase
    .from("loans")
    .select("*")
    .order("date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createMember(memberData) {
  const { data, error } = await supabase
    .from("members")
    .insert([memberData])
    .select()
    .single();
    
  if (error) throw error;
  return data;
}

export async function updateMember(id, updates) {
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
    
  if (error) throw error;
  return data;
}

export async function addRepayment(loanId, amount, userId) {
  // First, fetch the current loan to compute new paid amount
  const { data: loan, error: fetchErr } = await supabase
    .from("loans")
    .select("paid")
    .eq("id", loanId)
    .single();
    
  if (fetchErr) throw fetchErr;

  const newPaid = Number(loan.paid || 0) + Number(amount);
  
  // Make the update
  const { data, error: updateErr } = await supabase
    .from("loans")
    .update({ paid: newPaid })
    .eq("id", loanId)
    .select()
    .single();
    
  if (updateErr) throw updateErr;
  return data;
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

export async function distributeContribution(memberId, totalAmount, selMonth, selYear, userId, shouldDistribute, monthlyTarget, months) {
  if (!shouldDistribute) {
    return await upsertContribution(memberId, selMonth, selYear, totalAmount, userId);
  }

  // 1. Fetch history for current and previous year
  const prevYear = selYear - 1;
  const { data: history, error: hErr } = await supabase
    .from("contributions")
    .select("*")
    .eq("member_id", memberId)
    .in("year", [prevYear, selYear]);

  if (hErr) throw hErr;

  const getAmount = (m, y) => history.find(c => c.month === m && c.year === y)?.amount || 0;
  let remaining = totalAmount;

  // 2. Priority: Fill the selected month first
  const currentSel = getAmount(selMonth, selYear);
  const selGap = Math.max(0, monthlyTarget - currentSel);
  const fillSel = Math.min(remaining, selGap);
  await upsertContribution(memberId, selMonth, selYear, currentSel + fillSel, userId);
  remaining -= fillSel;

  if (remaining <= 0) return;

  // 3. Look Back: Fill arrears (Previous Year all months -> Current Year up to selected month)
  const selIdx = months.indexOf(selMonth);
  const backSchedule = [];
  months.forEach(m => backSchedule.push({ month: m, year: prevYear }));
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
  if (remaining > 0) {
    const { data: final } = await supabase.from("contributions").select("amount").eq("member_id", memberId).eq("month", selMonth).eq("year", selYear).single();
    await upsertContribution(memberId, selMonth, selYear, (final?.amount || 0) + remaining, userId);
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
