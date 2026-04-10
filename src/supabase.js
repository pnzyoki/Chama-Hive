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

export async function fetchMembers(chamaId) {
  let query = supabase.from("members").select("*").order("name", { ascending: true });
  if (chamaId) query = query.eq("chama_id", chamaId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function fetchContributions(year, chamaId) {
  let query = supabase.from("contributions").select("*").eq("year", year);
  if (chamaId) query = query.eq("chama_id", chamaId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function fetchLoans(chamaId) {
  let query = supabase.from("loans").select("*").order("date", { ascending: false });
  if (chamaId) query = query.eq("chama_id", chamaId);
  const { data, error } = await query;
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
  // Try to find if it exists
  const { data: existing, error: fetchErr } = await supabase
    .from("contributions")
    .select("id")
    .eq("member_id", memberId)
    .eq("month", month)
    .eq("year", year)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
    
  if (existing) {
    const { error } = await supabase
      .from("contributions")
      .update({ amount })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("contributions")
      .insert([{ member_id: memberId, month, year, amount }]);
    if (error) throw error;
  }
}

export async function fetchChama(chamaId) {
  const { data, error } = await supabase
    .from("chamas")
    .select("*")
    .eq("id", chamaId)
    .single();
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.reload();
}
