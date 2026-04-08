// src/Root.jsx
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import SignIn from "./SignIn";
import ChamaApp from "./chama-system";

export default function Root() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

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

  if (!session) {
    return <SignIn onSignedIn={() => {}} />;
  }

  return <ChamaApp session={session} />;
}