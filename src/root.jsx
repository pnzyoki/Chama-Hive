// src/Root.jsx
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import SignIn from "./SignIn";
import ResetPassword from "./ResetPassword";
import ChamaApp from "./chama-system";

export default function Root() {
  const [session, setSession] = useState(undefined);
  const [isRecovering, setIsRecovering] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovering(true);
      } else if (session?.user) {
        checkPasswordExpiration(session.user.id);
      }
    });

    // Initial check if session exists
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) checkPasswordExpiration(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkPasswordExpiration = async (userId) => {
    try {
      const { data: member } = await supabase
        .from("members")
        .select("password_changed_at")
        .eq("auth_id", userId)
        .single();
      
      if (member && member.password_changed_at) {
        const lastChanged = new Date(member.password_changed_at);
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        
        if (lastChanged < ninetyDaysAgo) {
          setIsRecovering(true);
        }
      }
    } catch (err) {
      console.warn("Could not check password expiration:", err);
    }
  };

  if (session === undefined) {
    return (
      <div style={{
        minHeight: "100vh", background: "#0d1f14",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'DM Sans', sans-serif", color: "#7a9e8a", fontSize: 18,
      }}>
        🌿 Loading ChamaHive…
      </div>
    );
  }

  if (isRecovering) {
    return <ResetPassword onComplete={() => setIsRecovering(false)} />;
  }

  if (!session) {
    return <SignIn onSignedIn={() => {}} />;
  }

  return <ChamaApp session={session} />;
}