// src/ResetPassword.jsx
import React, { useState } from "react";
import { supabase } from "./supabase";

export default function ResetPassword({ onComplete }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const checkStrength = (pass) => {
    if (!pass) return 0;
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[a-z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^a-zA-Z0-9]/.test(pass)) score++;
    return score;
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (checkStrength(password) < 3) {
      setError("Please use a stronger password (mix of uppercase, numbers, or symbols).");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;

      // Also update the members table password_changed_at if it exists
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("members")
          .update({ password_changed_at: new Date().toISOString() })
          .eq("auth_id", user.id);
      }

      setMessage("Password updated successfully! Redirecting...");
      setTimeout(() => {
        if (onComplete) onComplete();
      }, 2000);
    } catch (err) {
      setError(err.message || "Failed to update password.");
    } finally {
      setLoading(false);
    }
  };

  const strength = checkStrength(password);
  const strengthColors = ["#e05a5a", "#e05a5a", "#d4a017", "#2ea043", "#56d364", "#56d364"];
  const strengthLabels = ["Very Weak", "Weak", "Fair", "Good", "Strong", "Very Strong"];

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0d1f14 0%, #111c18 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans', 'Inter', sans-serif", padding: 20
    }}>
      <div style={{
        background: "#16251e", borderRadius: 24, padding: "48px 40px",
        width: "100%", maxWidth: 420, boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
        border: "1px solid rgba(125,212,160,0.1)", textAlign: "center"
      }}>
        <div style={{
          width: 72, height: 72, background: "rgba(45,125,70,0.2)",
          borderRadius: 20, margin: "0 auto 24px", color: "#56d364",
          fontSize: 32, display: "flex", alignItems: "center", justifyContent: "center",
          border: "1px solid rgba(45,125,70,0.4)"
        }}>
          🔑
        </div>
        <h1 style={{ margin: "0 0 8px", color: "#e6edf3", fontSize: 26, fontWeight: 800 }}>New Password</h1>
        <p style={{ color: "#8b949e", fontSize: 15, margin: "0 0 32px", lineHeight: 1.5 }}>
          Create a secure password for your account.
        </p>

        {error && (
          <div style={{ background: "rgba(224, 90, 90, 0.15)", border: "1px solid rgba(224, 90, 90, 0.4)", color: "#e05a5a", padding: "12px", borderRadius: 10, fontSize: 13, marginBottom: 20, textAlign: "left" }}>
            {error}
          </div>
        )}
        {message && (
          <div style={{ background: "rgba(45, 125, 70, 0.15)", border: "1px solid rgba(45, 125, 70, 0.4)", color: "#56d364", padding: "12px", borderRadius: 10, fontSize: 13, marginBottom: 20, textAlign: "left" }}>
            {message}
          </div>
        )}

        <form onSubmit={handleUpdatePassword}>
          <div style={{ marginBottom: 16, textAlign: "left" }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#8b949e", marginBottom: 8, letterSpacing: 0.5, textTransform: "uppercase" }}>New Password</label>
            <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value.trim())} required minLength={8} style={{
              width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid #30363d", background: "#0d1117",
              color: "#e6edf3", fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit"
            }} />
          </div>

          {password.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 16, alignItems: "center" }}>
              <div style={{ flex: 1, display: "flex", gap: 4 }}>
                {[1, 2, 3, 4, 5].map(lvl => (
                  <div key={lvl} style={{ height: 4, flex: 1, borderRadius: 2, background: strength >= lvl ? strengthColors[strength] : "#30363d" }} />
                ))}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: strengthColors[strength], width: 70, textAlign: "right" }}>
                {strengthLabels[strength]}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 24, textAlign: "left" }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#8b949e", marginBottom: 8, letterSpacing: 0.5, textTransform: "uppercase" }}>Confirm Password</label>
            <input type="password" placeholder="••••••••" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value.trim())} required minLength={8} style={{
              width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid #30363d", background: "#0d1117",
              color: "#e6edf3", fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit"
            }} />
          </div>

          <button disabled={loading} style={{
            width: "100%", padding: "16px", borderRadius: 12, background: "#238636", color: "#fff",
            fontSize: 16, fontWeight: 800, border: "none", fontFamily: "inherit", cursor: loading ? "not-allowed" : "pointer",
            boxShadow: "0 4px 12px rgba(35,134,54,0.3)", opacity: loading ? 0.7 : 1
          }}>
            {loading ? "Updating..." : "Set New Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
