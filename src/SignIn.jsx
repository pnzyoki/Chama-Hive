// src/SignIn.jsx
import React, { useState } from "react";
import { supabase } from "./supabase";

export default function SignIn({ onSignedIn }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!email) {
      setError("Please enter your email to receive a reset link.");
      return;
    }
    setLoading(true); setError(""); setMessage("");
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (resetErr) throw resetErr;
      setMessage("A password reset link has been sent to your email.");
    } catch (err) {
      setError(err.message || "Failed to send reset email.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    
    if (isSignUp && checkStrength(password) < 3) {
      setError("Your password is too weak. Please use a mix of uppercase, numbers, or symbols.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setMessage("");

      if (isSignUp) {
        const { data, error: signUpErr } = await supabase.auth.signUp({ email, password });
        if (signUpErr) throw signUpErr;

        if (data?.user && data?.session) {
          const { updatePasswordTimestamp } = await import("./supabase");
          await updatePasswordTimestamp(data.user.id);
          if (onSignedIn) onSignedIn();
        } else {
          setMessage("Registration successful! Please check your email to confirm your account.");
          setIsSignUp(false);
          setPassword("");
        }
      } else {
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signInErr) throw signInErr;
        if (onSignedIn) onSignedIn();
      }
    } catch (err) {
      setError(err.message || "Authentication failed. Check your data or connection.");
    } finally {
      setLoading(false);
    }
  };

  const strength = isSignUp ? checkStrength(password) : 0;
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
      }} className="animate-slide-up">
        <div style={{
          width: 72, height: 72, background: "rgba(45,125,70,0.2)",
          borderRadius: 20, margin: "0 auto 24px", color: "#56d364",
          fontSize: 32, display: "flex", alignItems: "center", justifyContent: "center",
          border: "1px solid rgba(45,125,70,0.4)"
        }}>
          🌿
        </div>
        <h1 style={{ margin: "0 0 8px", color: "#e6edf3", fontSize: 26, fontWeight: 800 }}>ChamaHive</h1>
        <p style={{ color: "#8b949e", fontSize: 15, margin: "0 0 32px", lineHeight: 1.5 }}>
          {isForgotMode ? "Reset your password." : isSignUp ? "Create your new sacco account." : "Sign in to your sacco account."}
        </p>

        {error && (
          <div className="animate-fade-in" style={{ background: "rgba(224, 90, 90, 0.15)", border: "1px solid rgba(224, 90, 90, 0.4)", color: "#e05a5a", padding: "12px", borderRadius: 10, fontSize: 13, marginBottom: 20, textAlign: "left" }}>
            {error}
          </div>
        )}
        {message && (
          <div className="animate-fade-in" style={{ background: "rgba(45, 125, 70, 0.15)", border: "1px solid rgba(45, 125, 70, 0.4)", color: "#56d364", padding: "12px", borderRadius: 10, fontSize: 13, marginBottom: 20, textAlign: "left" }}>
            {message}
          </div>
        )}

        {isForgotMode ? (
          <form style={{ marginBottom: 24 }} onSubmit={handleResetPassword}>
            <div style={{ marginBottom: 24, textAlign: "left" }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#8b949e", marginBottom: 8, letterSpacing: 0.5, textTransform: "uppercase" }}>Email Address</label>
              <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value.trim())} required style={{
                width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid #30363d", background: "#0d1117",
                color: "#e6edf3", fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit", transition: "border-color 0.2s"
              }} 
              onFocus={e => e.target.style.borderColor = "#2ea043"} onBlur={e => e.target.style.borderColor = "#30363d"} />
            </div>
            <button disabled={loading} style={{
              width: "100%", padding: "16px", borderRadius: 12, background: "#238636", color: "#fff",
              fontSize: 16, fontWeight: 800, border: "none", fontFamily: "inherit", cursor: loading ? "not-allowed" : "pointer",
              transition: "background 0.2s, transform 0.1s", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              boxShadow: "0 4px 12px rgba(35,134,54,0.3)", opacity: loading ? 0.7 : 1
            }}>
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
          </form>
        ) : (
          <form style={{ marginBottom: 24 }} onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16, textAlign: "left" }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#8b949e", marginBottom: 8, letterSpacing: 0.5, textTransform: "uppercase" }}>Email Address</label>
              <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value.trim())} required style={{
                width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid #30363d", background: "#0d1117",
                color: "#e6edf3", fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit", transition: "border-color 0.2s"
              }} 
              onFocus={e => e.target.style.borderColor = "#2ea043"} onBlur={e => e.target.style.borderColor = "#30363d"} />
            </div>
            <div style={{ marginBottom: isSignUp ? 8 : 24, textAlign: "left" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#8b949e", marginBottom: 8, letterSpacing: 0.5, textTransform: "uppercase" }}>
                  {isSignUp ? "Create Password" : "Password"}
                </label>
                {!isSignUp && (
                  <button type="button" onClick={() => { setIsForgotMode(true); setError(""); setMessage(""); }} style={{ background: "none", border: "none", color: "#56d364", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Forgot?</button>
                )}
              </div>
              <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value.trim())} required minLength={8} style={{
                width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid #30363d", background: "#0d1117",
                color: "#e6edf3", fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit", transition: "border-color 0.2s"
              }} 
              onFocus={e => e.target.style.borderColor = "#2ea043"} onBlur={e => e.target.style.borderColor = "#30363d"} />
            </div>
            {isSignUp && password.length > 0 && (
              <div style={{ display: "flex", gap: 6, marginBottom: 24, alignItems: "center" }}>
                <div style={{ flex: 1, display: "flex", gap: 4 }}>
                  {[1, 2, 3, 4, 5].map(lvl => (
                    <div key={lvl} style={{ height: 4, flex: 1, borderRadius: 2, background: strength >= lvl ? strengthColors[strength] : "#30363d", transition: "background 0.3s" }} />
                  ))}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: strengthColors[strength], width: 70, textAlign: "right" }}>
                  {strengthLabels[strength]}
                </div>
              </div>
            )}
            <button disabled={loading} style={{
              width: "100%", padding: "16px", borderRadius: 12, background: "#238636", color: "#fff",
              fontSize: 16, fontWeight: 800, border: "none", fontFamily: "inherit", cursor: loading ? "not-allowed" : "pointer",
              transition: "background 0.2s, transform 0.1s", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              boxShadow: "0 4px 12px rgba(35,134,54,0.3)", opacity: loading ? 0.7 : 1
            }}>
              {loading ? "Processing..." : (isSignUp ? "Sign Up" : "Sign In")}
            </button>
          </form>
        )}

        <div style={{ marginTop: 24, fontSize: 14, color: "#8b949e" }}>
          {isForgotMode ? (
            <button onClick={() => { setIsForgotMode(false); setError(""); setMessage(""); }} style={{ background: "none", border: "none", color: "#8b949e", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
              ← Back to Sign In
            </button>
          ) : isSignUp ? (
            <>
              Already have an account?{" "}
              <button onClick={() => { setIsSignUp(false); setError(""); setMessage(""); }} style={{ background: "none", border: "none", color: "#56d364", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Sign In</button>
            </>
          ) : (
            <>
              Don't have an account?{" "}
              <button onClick={() => { setIsSignUp(true); setError(""); setMessage(""); }} style={{ background: "none", border: "none", color: "#56d364", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Sign Up</button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
