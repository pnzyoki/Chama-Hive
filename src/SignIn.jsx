// src/SignIn.jsx
import React, { useState } from "react";
import { supabase } from "./supabase";

export default function SignIn({ onSignedIn }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    try {
      setLoading(true);
      setError("");
      setMessage("");

      if (isSignUp) {
        // Sign Up Flow
        const { data, error: signUpErr } = await supabase.auth.signUp({ email, password });
        if (signUpErr) throw signUpErr;

        if (data?.user && data?.session) {
          // Auto-login (email confirmation disabled)
          if (onSignedIn) onSignedIn();
        } else {
          setMessage("Registration successful! Please check your email to confirm your account.");
          // Optionally switch back to signin mode
          setIsSignUp(false);
          setPassword("");
        }
      } else {
        // Sign In Flow
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


  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0d1f14 0%, #111c18 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans', 'Inter', sans-serif", padding: 20
    }}>
      <div style={{
        background: "#16251e",
        borderRadius: 24,
        padding: "48px 40px",
        width: "100%",
        maxWidth: 420,
        boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
        border: "1px solid rgba(125,212,160,0.1)",
        textAlign: "center"
      }}>
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
          {isSignUp ? "Create your new sacco account." : "Sign in to your sacco account."}
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

        <form style={{ marginBottom: 24 }} onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16, textAlign: "left" }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#8b949e", marginBottom: 8, letterSpacing: 0.5, textTransform: "uppercase" }}>Email Address</label>
            <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required style={{
              width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid #30363d", background: "#0d1117",
              color: "#e6edf3", fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit", transition: "border-color 0.2s"
            }} 
            onFocus={e => e.target.style.borderColor = "#2ea043"}
            onBlur={e => e.target.style.borderColor = "#30363d"}
            />
          </div>
          <div style={{ marginBottom: 24, textAlign: "left" }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#8b949e", marginBottom: 8, letterSpacing: 0.5, textTransform: "uppercase" }}>
               {isSignUp ? "Create Password" : "Password"}
            </label>
            <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} style={{
              width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid #30363d", background: "#0d1117",
              color: "#e6edf3", fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit", transition: "border-color 0.2s"
            }} 
            onFocus={e => e.target.style.borderColor = "#2ea043"}
            onBlur={e => e.target.style.borderColor = "#30363d"}
            />
          </div>
          <button disabled={loading} style={{
            width: "100%", padding: "16px", borderRadius: 12, background: "#238636", color: "#fff",
            fontSize: 16, fontWeight: 800, border: "none", fontFamily: "inherit", cursor: loading ? "not-allowed" : "pointer",
            transition: "background 0.2s, transform 0.1s", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            boxShadow: "0 4px 12px rgba(35,134,54,0.3)", opacity: loading ? 0.7 : 1
          }}
          onMouseEnter={e => !loading && (e.currentTarget.style.background = "#2ea043")}
          onMouseLeave={e => !loading && (e.currentTarget.style.background = "#238636")}
          onMouseDown={e => !loading && (e.currentTarget.style.transform = "scale(0.98)")}
          onMouseUp={e => !loading && (e.currentTarget.style.transform = "scale(1)")}
          >
            {loading ? "Processing..." : (isSignUp ? "Sign Up" : "Sign In")}
          </button>
        </form>

        <div style={{ marginTop: 24, fontSize: 14, color: "#8b949e" }}>
          {isSignUp ? (
            <>
              Already have an account?{" "}
              <button 
                onClick={() => { setIsSignUp(false); setError(""); setMessage(""); }}
                style={{ background: "none", border: "none", color: "#56d364", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 }}
              >
                Sign In
              </button>
            </>
          ) : (
            <>
              Don't have an account?{" "}
              <button 
                onClick={() => { setIsSignUp(true); setError(""); setMessage(""); }}
                style={{ background: "none", border: "none", color: "#56d364", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 }}
              >
                Sign Up
              </button>
            </>
          )}
        </div>

        <div style={{ marginTop: 24, fontSize: 14, color: "#8b949e" }}>
          {isSignUp ? (
            <>
              Already have an account?{" "}
              <button 
                onClick={() => { setIsSignUp(false); setError(""); setMessage(""); }}
                style={{ background: "none", border: "none", color: "#56d364", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 }}
              >
                Sign In
              </button>
            </>
          ) : (
            <>
              Don't have an account?{" "}
              <button 
                onClick={() => { setIsSignUp(true); setError(""); setMessage(""); }}
                style={{ background: "none", border: "none", color: "#56d364", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 }}
              >
                Sign Up
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
