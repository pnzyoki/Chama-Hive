import { useState, useEffect } from "react";
import { supabase, fetchProfile, fetchMembers, fetchContributions, fetchLoans, signOut } from "./supabase";
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

export const toastEmitter = new EventTarget();
export const showToast = (text, type = "success") => {
  toastEmitter.dispatchEvent(new CustomEvent("show-toast", { detail: { text, type } }));
};

const GlobalToast = () => {
  const [toast, setToast] = useState(null);
  useEffect(() => {
    let timeoutId;
    const handler = (e) => {
      if (timeoutId) clearTimeout(timeoutId);
      setToast(e.detail);
      timeoutId = setTimeout(() => setToast(null), 4000);
    };
    toastEmitter.addEventListener("show-toast", handler);
    return () => {
      toastEmitter.removeEventListener("show-toast", handler);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <div className="animate-slide-up" style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      background: isError ? "#FFEAEA" : "#E8F5ED", border: `1px solid ${isError ? "#E05A5A" : "#2D7D46"}`,
      color: isError ? "#E05A5A" : "#2D7D46", padding: "14px 24px", borderRadius: 12,
      fontWeight: 700, fontSize: 14, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", display: "flex", gap: 10, alignItems: "center"
    }}>
       {isError ? "⚠️" : "✅"} {toast.text}
    </div>
  );
};

// ─── Theme Definitions ────────────────────────────────────────────────────────
const THEMES = {
  light: {
    bg: "#f4f5f7",
    surface: "#ffffff",
    surface2: "#f8f8f8",
    surface3: "#f0f0f0",
    border: "#e0e0e0",
    text: "#1a1a1a",
    textSub: "#888888",
    textMuted: "#aaaaaa",
    sidebar: "#111c18",
    sidebarText: "#7a9e8a",
    sidebarSub: "#4a7c5c",
    sidebarActive: "#2d7d46",
    sidebarBorder: "rgba(255,255,255,0.07)",
    sidebarUserActive: "rgba(45,125,70,0.25)",
    sidebarUserBorder: "rgba(45,125,70,0.5)",
    sidebarUserText: "#7dd4a0",
    inputBg: "#fafafa",
    rowEven: "#fafafa",
    rowOdd: "#ffffff",
    warningBg: "#fff8e6",
    warningBorder: "#f0d080",
    warningText: "#b8860b",
    dangerBg: "#ffeaea",
    successBg: "#e8f5ed",
    infoRowBg: "#f8f8f8",
    cardShadow: "0 2px 12px rgba(0,0,0,0.06)",
    headerCardBg: "#ffffff",
    completedLoanBg: "#f8f8f8",
    completedLoanText: "#555555",
  },
  dark: {
    bg: "#0d1117",
    surface: "#161b22",
    surface2: "#1c2128",
    surface3: "#21262d",
    border: "#30363d",
    text: "#e6edf3",
    textSub: "#8b949e",
    textMuted: "#6e7681",
    sidebar: "#0d1117",
    sidebarText: "#6e9e80",
    sidebarSub: "#3d6b50",
    sidebarActive: "#238636",
    sidebarBorder: "rgba(255,255,255,0.06)",
    sidebarUserActive: "rgba(35,134,54,0.2)",
    sidebarUserBorder: "rgba(35,134,54,0.4)",
    sidebarUserText: "#56d364",
    inputBg: "#0d1117",
    rowEven: "#1c2128",
    rowOdd: "#161b22",
    warningBg: "#271d08",
    warningBorder: "#7a5c00",
    warningText: "#d4a017",
    dangerBg: "#2a1215",
    successBg: "#0d2117",
    infoRowBg: "#1c2128",
    cardShadow: "0 2px 12px rgba(0,0,0,0.3)",
    headerCardBg: "#161b22",
    completedLoanBg: "#1c2128",
    completedLoanText: "#8b949e",
  },
};

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHLY_TARGET = 200;
const INTEREST_RATE  = 0.10;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtKES = (n) => `KES ${Number(n).toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;

// Build a nested lookup scoped to a specific year: map[memberId][month] = amount
const buildContribMap = (contributions, year) => {
  if (!contributions || !Array.isArray(contributions)) return {};
  const map = {};
  contributions.forEach(c => {
    if (c.year === year) {
      if (!map[c.member_id]) map[c.member_id] = {};
      map[c.member_id][c.month] = c.amount;
    }
  });
  return map;
};

// All-time total across all years
const totalContrib = (contributions, memberId) => {
  if (!contributions || !Array.isArray(contributions)) return 0;
  return contributions.reduce((sum, c) => (c.member_id === memberId ? sum + c.amount : sum), 0);
};

// Total for a specific year
const totalContribYear = (contributions, memberId, year) => {
  if (!contributions || !Array.isArray(contributions)) return 0;
  return contributions.reduce((sum, c) => (c.member_id === memberId && c.year === year ? sum + c.amount : sum), 0);
};

// Aggregate totals dynamically per month
const getMonthlyTotals = (contributions, activeYear, limit = 12) => {
  return MONTHS.slice(0, limit).map(mo => {
    let sum = 0;
    if (contributions && Array.isArray(contributions)) {
      contributions.forEach(c => { if (c.month === mo && c.year === activeYear) sum += c.amount; });
    }
    return { month: mo, amount: sum };
  });
};

const calculateDebt = (member, contributions, activeYear) => {
  if (!member.join_date) return 0;
  const joinDate = new Date(member.join_date);
  const joinYear = joinDate.getFullYear();
  const joinMonth = joinDate.getMonth(); // 0 = Jan, 11 = Dec
  
  const currentCalendarYear = new Date().getFullYear();
  const currentCalendarMonth = new Date().getMonth();
  
  let targetYear = activeYear;
  let targetMonth = 11;
  
  if (targetYear >= currentCalendarYear) {
    targetYear = currentCalendarYear;
    targetMonth = currentCalendarMonth;
  }
  
  if (joinYear > targetYear || (joinYear === targetYear && joinMonth > targetMonth)) {
    return 0; // Joined after the cutoff
  }
  
  let expectedMonths = 0;
  if (joinYear === targetYear) {
    expectedMonths = targetMonth - joinMonth + 1;
  } else {
    expectedMonths = (12 - joinMonth) + ((targetYear - 1 - joinYear) * 12) + (targetMonth + 1);
  }
  
  const expectedTotal = expectedMonths * MONTHLY_TARGET;
  const actualTotal = contributions.reduce((sum, c) => 
    (c.member_id === member.id && c.year <= targetYear) ? sum + c.amount : sum
  , 0);
  
  return Math.max(0, expectedTotal - actualTotal);
};

const loanBalance = (loan) => {
  const months   = Math.ceil((new Date() - new Date(loan.date)) / (1000 * 60 * 60 * 24 * 30));
  const interest = loan.amount * (loan.interest_rate ?? INTEREST_RATE) * Math.max(months, 1);
  return Math.max(0, loan.amount + interest - loan.paid);
};

const isPrivileged = (role) => ["admin", "treasurer", "chairman"].includes(role);

// ─── Base Components ──────────────────────────────────────────────────────────
const Avatar = ({ initials, size = 36, color }) => {
  const colors = { chairman: "#c8a84b", treasurer: "#2d7d46", admin: "#1a5c8a", member: "#555" };
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", display: "flex", alignItems: "center",
      justifyContent: "center", background: colors[color] || "#2d7d46", color: "#fff",
      fontWeight: 700, fontSize: size * 0.35, flexShrink: 0, fontFamily: "inherit",
    }}>{initials}</div>
  );
};

const Badge = ({ role, t }) => {
  const cfg = {
    chairman:  { bg: t.warningBg, color: "#c8a84b", label: "Chairman"  },
    treasurer: { bg: t.successBg, color: "#2d7d46", label: "Treasurer" },
    admin:     { bg: "#1e3a5c",   color: "#5b9bd5", label: "Admin"     },
    member:    { bg: t.surface3,  color: t.textSub, label: "Member"    },
  };
  const c = cfg[role] || cfg.member;
  return <span style={{ background: c.bg, color: c.color, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>{c.label}</span>;
};

const StatCard = ({ label, value, sub, accent, t }) => (
  <div style={{
    background: t.surface, borderRadius: 16, padding: "18px 20px", flex: "1 1 140px", minWidth: 0,
    borderLeft: `4px solid ${accent}`, boxShadow: t.cardShadow, border: `1px solid ${t.border}`,
  }}>
    <div style={{ fontSize: 11, color: t.textSub, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 800, color: t.text, lineHeight: 1.1 }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>{sub}</div>}
  </div>
);

const Modal = ({ title, onClose, children, t }) => {
  const isMobile = window.innerWidth < 768;
  return (
  <div className="animate-fade-in" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center" }}>
    <div className="animate-slide-up" style={{
      background: t.surface,
      borderRadius: isMobile ? "20px 20px 0 0" : 20,
      padding: isMobile ? "24px 20px 32px" : 32,
      width: isMobile ? "100%" : "90%",
      maxWidth: isMobile ? "100%" : 520,
      maxHeight: isMobile ? "90vh" : "85vh",
      overflowY: "auto",
      boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
      border: `1px solid ${t.border}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: t.text }}>{title}</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: t.textSub, lineHeight: 1 }}>×</button>
      </div>
      {children}
    </div>
  </div>
  );
};

const Input = ({ label, t, ...props }) => (
  <div style={{ marginBottom: 16 }}>
    {label && <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.textSub, marginBottom: 6, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</label>}
    <input {...props} style={{
      width: "100%", padding: "10px 14px", border: `1.5px solid ${t.border}`, borderRadius: 10, fontSize: 14,
      outline: "none", boxSizing: "border-box", fontFamily: "inherit", background: t.inputBg, color: t.text,
      transition: "border-color 0.2s", ...props.style,
    }} onFocus={e => e.target.style.borderColor = "#2d7d46"} onBlur={e => e.target.style.borderColor = t.border} />
  </div>
);

const Select = ({ label, t, children, ...props }) => (
  <div style={{ marginBottom: 16 }}>
    {label && <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.textSub, marginBottom: 6, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</label>}
    <select {...props} style={{
      width: "100%", padding: "10px 14px", border: `1.5px solid ${t.border}`, borderRadius: 10, fontSize: 14,
      fontFamily: "inherit", background: t.inputBg, color: t.text, outline: "none", transition: "border-color 0.2s",
      ...props.style
    }} onFocus={e => e.target.style.borderColor = "#2d7d46"} onBlur={e => e.target.style.borderColor = t.border}>{children}</select>
  </div>
);

const YearSelector = ({ activeYear, setActiveYear, style, optionStyle }) => (
  <select value={activeYear} onChange={e => setActiveYear(Number(e.target.value))} style={{
    fontSize: 13, fontWeight: 700, outline: "none", fontFamily: "inherit", cursor: "pointer", ...style
  }}>
    {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y} style={optionStyle}>{y}</option>)}
  </select>
);

const Btn = ({ children, variant = "primary", small, t, ...props }) => {
  const styles = {
    primary: { background: "#2d7d46", color: "#fff" },
    danger:  { background: "#c0392b", color: "#fff" },
    ghost:   { background: t?.surface3 || "#f0f0f0", color: t?.text || "#333" },
    gold:    { background: "#c8a84b", color: "#fff" },
  };
  return (
    <button {...props} style={{
      ...styles[variant], border: "none", borderRadius: 10,
      padding: small ? "7px 16px" : "11px 22px",
      fontWeight: 700, fontSize: small ? 12 : 14, cursor: "pointer", fontFamily: "inherit",
      transition: "opacity 0.15s", letterSpacing: 0.3, ...props.style,
    }}
      onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
      onMouseLeave={e => e.currentTarget.style.opacity = "1"}
    >{children}</button>
  );
};

// ─── Dark Mode Toggle ─────────────────────────────────────────────────────────
const DarkModeToggle = ({ darkMode, setDarkMode, t }) => (
  <button
    onClick={() => setDarkMode(d => !d)}
    title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
    style={{
      display: "flex", alignItems: "center", gap: 8,
      background: t.headerCardBg, border: `1px solid ${t.border}`,
      borderRadius: 24, padding: "7px 14px", cursor: "pointer",
      fontFamily: "inherit", transition: "all 0.2s",
    }}
  >
    <span style={{ fontSize: 15 }}>{darkMode ? "🌙" : "☀️"}</span>
    <div style={{
      width: 36, height: 20, borderRadius: 10,
      background: darkMode ? "#238636" : "#d0d7de",
      position: "relative", transition: "background 0.3s",
    }}>
      <div style={{
        position: "absolute", top: 3,
        left: darkMode ? 19 : 3,
        width: 14, height: 14, borderRadius: "50%",
        background: "#fff", transition: "left 0.25s",
        boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
      }} />
    </div>
    <span style={{ fontSize: 12, fontWeight: 700, color: t.textSub, minWidth: 32 }}>
      {darkMode ? "Dark" : "Light"}
    </span>
  </button>
);

// ─── Views ────────────────────────────────────────────────────────────────────
function Dashboard({ members, contributions, loans, currentUser, activeYear, t, isMobile }) {
  const approvedMembers = members.filter(m => m.status === "approved");
  const totalFunds  = approvedMembers.reduce((s, m) => s + totalContrib(contributions, m.id), 0);
  const totalLoaned = loans.filter(l => l.status === "active").reduce((s, l) => s + l.amount, 0);
  const totalOwed   = loans.filter(l => l.status === "active").reduce((s, l) => s + loanBalance(l), 0);
  const myContrib   = totalContribYear(contributions, currentUser.id, activeYear);
  const myLoans     = loans.filter(l => l.member_id === currentUser.id && l.status === "active");
  const privileged  = isPrivileged(currentUser.role);

  // Data for charts
  const fundsData = [
    { name: "Available", value: Math.max(0, totalFunds - totalLoaned), color: "#2d7d46" },
    { name: "Loaned Out", value: totalLoaned, color: "#c8a84b" }
  ];

  const monthlyTotals = getMonthlyTotals(contributions, activeYear, 8);

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: t.text }}>
          Welcome back, {currentUser.name.split(" ")[0]} 👋
        </h2>
        <p style={{ color: t.textSub, margin: "4px 0 0", fontSize: 14 }}>Here's your chama at a glance</p>
      </div>

      <div style={{ display: "flex", gap: 24, flexDirection: isMobile ? "column" : "row" }}>
        
        {/* Main Content Area */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Summary — visible to ALL members */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 28 }}>
            <StatCard t={t} label="Total Chama Funds"  value={fmtKES(totalFunds)}  sub={`${members.length} active members`} accent="#2d7d46" />
            <StatCard t={t} label={`My ${activeYear} Contributions`} value={fmtKES(myContrib)} sub={`Target: ${fmtKES(MONTHLY_TARGET * 12)}`} accent="#1a5c8a" />
            {privileged && <>
              <StatCard t={t} label="Active Loans"            value={fmtKES(totalLoaned)} sub={`${loans.filter(l=>l.status==="active").length} loans out`} accent="#c8a84b" />
              <StatCard t={t} label="Total Owed (+ Interest)" value={fmtKES(totalOwed)}   sub="Principal + accrued interest" accent="#e07b39" />
            </>}
          </div>

          {/* My active loans — visible to all (own loans only) */}
          {myLoans.length > 0 && (
            <div style={{ background: t.warningBg, border: `1.5px solid ${t.warningBorder}`, borderRadius: 16, padding: 20, marginBottom: 24 }}>
              <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 800, color: t.warningText }}>⚠ Your Active Loans</h3>
              {myLoans.map(loan => (
                <div key={loan.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${t.warningBorder}` }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: t.text }}>{fmtKES(loan.amount)} — {loan.purpose}</div>
                    <div style={{ fontSize: 12, color: t.textSub }}>Due: {loan.due_date} · {loan.interest_rate * 100}%/mo interest</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, color: "#e05a5a", fontSize: 16 }}>{fmtKES(loanBalance(loan))}</div>
                    <div style={{ fontSize: 11, color: t.textMuted }}>remaining</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Contribution overview table — all members see status icons; only privileged see KES totals per member */}
          <div style={{ background: t.surface, borderRadius: 16, padding: 24, boxShadow: t.cardShadow, border: `1px solid ${t.border}` }}>
            <h3 style={{ margin: "0 0 18px", fontSize: 15, fontWeight: 800, color: t.text }}>{activeYear} Contribution Overview</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "8px 12px", color: t.textSub, fontWeight: 700, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" }}>Member</th>
                    {MONTHS.slice(0,8).map(m => <th key={m} style={{ padding: "8px 8px", color: t.textSub, fontWeight: 700, fontSize: 11 }}>{m}</th>)}
                    <th style={{ padding: "8px 8px", color: "#e05a5a", fontWeight: 700, fontSize: 11 }}>Arrears</th>
                    {privileged && <th style={{ padding: "8px 12px", color: t.textSub, fontWeight: 700, fontSize: 11 }}>Total</th>}
                  </tr>
                </thead>
                <tbody>
                  {members.map((member, i) => (
                    <tr key={member.id} style={{ background: i % 2 === 0 ? t.rowEven : t.rowOdd }}>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Avatar initials={member.avatar} size={30} color={member.role} />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: t.text }}>{member.name}</div>
                            <Badge role={member.role} t={t} />
                          </div>
                        </div>
                      </td>
                      {MONTHS.slice(0,8).map(mo => {
                        const map     = buildContribMap(contributions, activeYear);
                        const val     = map[member.id]?.[mo] || 0;
                        const full    = val >= MONTHLY_TARGET;
                        const partial = val > 0 && val < MONTHLY_TARGET;
                        return (
                          <td key={mo} style={{ padding: "10px 8px", textAlign: "center" }}>
                            <div style={{
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              width: 32, height: 32, borderRadius: 8,
                              background: full ? t.successBg : partial ? t.warningBg : t.dangerBg,
                              color: full ? "#2d7d46" : partial ? "#c8a84b" : "#e05a5a",
                              fontWeight: 700, fontSize: 11,
                            }}>
                              {full ? "✓" : partial ? "½" : "✗"}
                            </div>
                          </td>
                        );
                      })}
                      {/* Arrears column — always visible */}
                      {(() => {
                        const debt = calculateDebt(member, contributions, activeYear);
                        return (
                          <td style={{ padding: "10px 8px", textAlign: "center" }}>
                            {debt > 0 ? (
                              <span style={{
                                background: "rgba(224,90,90,0.12)", color: "#e05a5a",
                                borderRadius: 8, padding: "4px 8px", fontWeight: 800, fontSize: 11,
                                border: "1px solid rgba(224,90,90,0.3)", whiteSpace: "nowrap"
                              }}>
                                -{fmtKES(debt)}
                              </span>
                            ) : (
                              <span style={{ color: "#2d7d46", fontWeight: 700, fontSize: 13 }}>✓</span>
                            )}
                          </td>
                        );
                      })()}
                      {/* KES totals per member — privileged only */}
                      {privileged && (
                        <td style={{ padding: "10px 12px", fontWeight: 800, color: t.text }}>
                          {fmtKES(totalContribYear(contributions, member.id, activeYear))}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 16, fontSize: 12, color: t.textSub, flexWrap: "wrap" }}>
              {[["Full", t.successBg],["Partial", t.warningBg],["Missed", t.dangerBg]].map(([label, bg]) => (
                <span key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: bg, display: "inline-block" }} /> {label}
                </span>
              ))}
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: "rgba(224,90,90,0.2)", display: "inline-block", border: "1px solid rgba(224,90,90,0.5)" }} /> Arrears = unpaid balance from previous years
              </span>
            </div>
          </div>
        </div>

        {/* Side Panel for Charts */}
        <div style={{ flex: isMobile ? "auto" : "0 0 320px", display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Chart 1: Fund Allocation Pie */}
          <div style={{ background: t.surface, borderRadius: 16, padding: 20, boxShadow: t.cardShadow, border: `1px solid ${t.border}` }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 800, color: t.text }}>Fund Allocation</h3>
            <div style={{ height: 220, position: "relative" }}>
              {totalFunds > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={fundsData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                      {fundsData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                    </Pie>
                    <RechartsTooltip formatter={(value) => fmtKES(value)} contentStyle={{ borderRadius: 8, background: t.surface, borderColor: t.border, color: t.text }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: t.textMuted, fontSize: 13 }}>No funds available</div>
              )}
              {totalFunds > 0 && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", pointerEvents: "none" }}>
                  <div style={{ fontSize: 12, color: t.textSub }}>Total</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: t.text }}>{fmtKES(totalFunds)}</div>
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 12, fontSize: 12, color: t.text }}>
              {fundsData.map(d => (
                <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: d.color }} />
                  {d.name}
                </div>
              ))}
            </div>
          </div>
          
          {/* Chart 2: Monthly Contributions Bar */}
          <div style={{ background: t.surface, borderRadius: 16, padding: 20, boxShadow: t.cardShadow, border: `1px solid ${t.border}` }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 800, color: t.text }}>Contributions per Month</h3>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTotals} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={t.border} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: t.textSub }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: t.textSub }} tickFormatter={(val) => val >= 1000 ? `${(val/1000)}k` : val} />
                  <RechartsTooltip formatter={(value) => fmtKES(value)} cursor={{ fill: t.surface2 }} contentStyle={{ borderRadius: 8, background: t.surface, borderColor: t.border, color: t.text }} />
                  <Bar dataKey="amount" fill="#1a5c8a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContributionsView({ members, contributions, setContributions, currentUser, activeYear, t }) {
  const [modal,       setModal]      = useState(null);
  const [form,        setForm]       = useState({ memberId: "", month: "", amount: "", year: activeYear, shouldDistribute: true });
  const [xlStatus,    setXlStatus]   = useState(""); // feedback for excel upload
  const [xlPreview,   setXlPreview]  = useState(null); // parsed rows before confirm
  const [error,       setError]      = useState("");
  const privileged   = isPrivileged(currentUser.role);
  const isTreasurer  = currentUser.role === "treasurer";
  const canEdit      = privileged;
  // Regular members only see their own record; Admins see all APPROVED members
  const visibleMembers = privileged 
    ? members.filter(m => m.status === "approved") 
    : members.filter(m => m.id === currentUser.id && m.status === "approved");

  const handleSave = async () => {
    if (!form.memberId || !form.month || !form.amount) return;
    setError("");
    try {
      const { distributeContribution, fetchContributions } = await import("./supabase");
      await distributeContribution(
        form.memberId, 
        Number(form.amount), 
        form.month, 
        Number(form.year), 
        currentUser.id, 
        form.shouldDistribute, 
        MONTHLY_TARGET, 
        MONTHS
      );
      
      // Re-fetch ALL years to ensure past-year contributions remain in state
      const contribData = await fetchContributions(null);
      setContributions(contribData);

      setModal(null);
      setForm({ memberId: "", month: "", amount: "", year: activeYear, shouldDistribute: true });
      showToast("Contribution saved successfully.");
    } catch (err) {
      setError(err.message || "Failed to save contribution. Check console.");
      console.error("Save failure:", err);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const XLSX = await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm");
      const data = members.map(m => {
        const row = { Name: m.name };
        MONTHS.forEach(mo => row[mo] = "");
        return row;
      });
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Contributions");
      XLSX.writeFile(wb, "ChamaHive_Contributions_Template.xlsx");
    } catch (err) {
      console.error("Template download failed:", err);
      setXlStatus("❌ Failed to generate template.");
    }
  };

  // Excel upload: parse CSV/XLSX via SheetJS
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setXlStatus("❌ File is too large. Maximum size is 2MB.");
      e.target.value = "";
      return;
    }
    setXlStatus("Reading file…");
    try {
      const XLSX = await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm");
      const data = await file.arrayBuffer();
      const wb   = XLSX.read(data, { type: "array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      // Expected columns: Name (or ID), Jan, Feb, … Dec
      const preview = [];
      rows.forEach(row => {
        const memberName = (row["Name"] || row["name"] || "").toString().trim();
        const member = members.find(m => m.name.toLowerCase() === memberName.toLowerCase() || String(m.id) === memberName);
        if (!member) return;
        const updates = {};
        MONTHS.forEach(mo => {
          let val = parseFloat(row[mo] || row[mo.toLowerCase()] || 0);
          if (!isNaN(val) && val > 0) {
            val = Math.min(val, 100000000); // 100M cap
            updates[mo] = val;
          }
        });
        if (Object.keys(updates).length) preview.push({ member, updates });
      });
      if (!preview.length) { setXlStatus("⚠ No matching members or contribution data found. Check column headers match member names and month abbreviations (Jan, Feb…)."); return; }
      setXlPreview(preview);
      setXlStatus("");
      setModal("xlpreview");
    } catch {
      setXlStatus("❌ Could not parse file. Please upload a valid .xlsx or .csv file.");
    }
    e.target.value = "";
  };

  const applyXlPreview = async () => {
    try {
      const updatesToPush = [];
      const currentYear = activeYear;
      
      xlPreview.forEach(({ member, updates }) => {
        Object.entries(updates).forEach(([mo, amt]) => {
          updatesToPush.push({ 
            member_id: member.id, 
            month: mo, 
            year: currentYear, 
            amount: Number(amt) 
          });
        });
      });

      if (updatesToPush.length > 0) {
        const { bulkUpsertContributions, fetchContributions } = await import("./supabase");
        await bulkUpsertContributions(updatesToPush);
        
        // Re-fetch ALL years to ensure local state is perfectly in sync with DB
        const freshData = await fetchContributions(null);
        setContributions(freshData);
      }

      setXlPreview(null);
      setModal(null);
      showToast(`Successfully pushed ${updatesToPush.length} contributions to Supabase.`);
      setXlStatus(`✅ Successfully pushed ${updatesToPush.length} contributions to Supabase.`);
      setTimeout(() => setXlStatus(""), 5000);
    } catch (err) {
      console.error("Bulk upload failed:", err);
      showToast("Failed to push to Supabase. Check console.", "error");
      setXlStatus("❌ Failed to push to Supabase. Check console.");
      setTimeout(() => setXlStatus(""), 5000);
    }
  };

  const MemberCard = ({ member }) => {
    const totalYear = totalContribYear(contributions, member.id, activeYear);
    const target = MONTHLY_TARGET * 12;
    const debt = calculateDebt(member, contributions, activeYear);
    const pct = Math.min(100, (totalYear / target) * 100);

    return (
      <div style={{ background: t.surface, borderRadius: 16, padding: 20, marginBottom: 14, boxShadow: t.cardShadow, border: `1px solid ${t.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar initials={member.avatar} size={40} color={member.role} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: t.text }}>{member.name}</div>
              <Badge role={member.role} t={t} />
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: "#2d7d46" }}>{fmtKES(totalYear)}</div>
            <div style={{ fontSize: 12, color: t.textMuted }}>of {fmtKES(target)} (Yr {activeYear})</div>
            {debt > 0 && <div style={{ fontSize: 11, color: "#e05a5a", fontWeight: 700, marginTop: 4 }}>Arrears: {fmtKES(debt)}</div>}
          </div>
        </div>
        <div style={{ background: t.surface3, borderRadius: 8, height: 8, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? "#2d7d46" : pct >= 60 ? "#c8a84b" : "#e07b39", borderRadius: 8 }} />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {MONTHS.map(mo => {
            const map = buildContribMap(contributions, activeYear);
            const val = map[member.id]?.[mo] || 0;
            return (
              <div key={mo} style={{
                flex: 1, minWidth: 48, textAlign: "center", padding: "6px 4px", borderRadius: 8,
                background: val >= MONTHLY_TARGET ? t.successBg : val > 0 ? t.warningBg : t.surface2,
                border: `1px solid ${val >= MONTHLY_TARGET ? "#2d7d46" : val > 0 ? t.warningBorder : t.border}`,
              }}>
                <div style={{ fontSize: 10, color: t.textSub, fontWeight: 700 }}>{mo}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: val >= MONTHLY_TARGET ? "#2d7d46" : val > 0 ? "#c8a84b" : t.textMuted }}>
                  {val > 0 ? `${(val/1000).toFixed(1)}k` : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: t.text }}>Contributions</h2>
          <p style={{ color: t.textSub, margin: "4px 0 0", fontSize: 13 }}>Monthly target: {fmtKES(MONTHLY_TARGET)} per member</p>
        </div>
        {canEdit && (
          <div style={{ display: "flex", gap: 10 }}>
            {/* Treasurer Excel upload */}
            {(isTreasurer || currentUser.role === "admin" || currentUser.role === "chairman") && (
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={handleDownloadTemplate} style={{
                  display: "flex", alignItems: "center", gap: 7, background: t.surface3,
                  border: `1px solid ${t.border}`, borderRadius: 10, padding: "9px 16px",
                  cursor: "pointer", fontSize: 13, fontWeight: 700, color: t.text, whiteSpace: "nowrap",
                }}>
                  📥 Download Template
                </button>
                <label style={{
                  display: "flex", alignItems: "center", gap: 7, background: t.surface3,
                  border: `1px solid ${t.border}`, borderRadius: 10, padding: "9px 16px",
                  cursor: "pointer", fontSize: 13, fontWeight: 700, color: t.text, whiteSpace: "nowrap",
                }}>
                  📊 Upload Excel
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} style={{ display: "none" }} />
                </label>
              </div>
            )}
            <Btn t={t} onClick={() => setModal("add")}>+ Record Payment</Btn>
          </div>
        )}
      </div>

      {/* Excel template hint */}
      {canEdit && (
        <div style={{ background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 12, padding: "11px 16px", marginBottom: 20, fontSize: 12, color: t.textSub, display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>📋</span>
          <span>
            <strong style={{ color: t.text }}>Excel format:</strong> Column A = <code style={{ background: t.surface3, padding: "1px 5px", borderRadius: 4 }}>Name</code> (must match enrolled member name exactly), then one column per month using 3-letter abbreviations: <code style={{ background: t.surface3, padding: "1px 5px", borderRadius: 4 }}>Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec</code>. Amounts in KES. Leave blank for no contribution that month.
          </span>
        </div>
      )}

      {/* Upload status */}
      {xlStatus && (
        <div style={{ background: xlStatus.startsWith("✅") ? t.successBg : t.warningBg, border: `1px solid ${xlStatus.startsWith("✅") ? "#2d7d46" : t.warningBorder}`, borderRadius: 12, padding: "11px 16px", marginBottom: 16, fontSize: 13, color: xlStatus.startsWith("✅") ? "#2d7d46" : t.warningText, fontWeight: 600 }}>
          {xlStatus}
        </div>
      )}

      {/* Member cards — privileged see all, regular see only own */}
      {visibleMembers.map(member => <MemberCard key={member.id} member={member} />)}
      {/* Manual entry modal */}
      {modal === "add" && (
        <Modal title="Record Contribution" onClose={() => setModal(null)} t={t}>
          {error && <div style={{ background: t.dangerBg, color: "#e05a5a", padding: "10px 14px", borderRadius: 10, fontSize: 13, marginBottom: 16, border: "1px solid rgba(224,90,90,0.3)" }}>⚠️ {error}</div>}
          <Select label="Member" t={t} value={form.memberId} onChange={e => setForm({ ...form, memberId: e.target.value })}>
            <option value="">Select member...</option>
            {members.filter(m => m.status === "approved").map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
          <Select label="Month" t={t} value={form.month} onChange={e => setForm({ ...form, month: e.target.value })}>
            <option value="">Select month...</option>
            {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
          </Select>
          <Select label="Year" t={t} value={form.year} onChange={e => setForm({ ...form, year: e.target.value })}>
            {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </Select>
          <Input t={t} label="Amount (KES)" type="number" placeholder="200" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
          
          <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, cursor: "pointer", fontSize: 13, color: t.textSub }}>
            <input type="checkbox" checked={form.shouldDistribute} onChange={e => setForm({ ...form, shouldDistribute: e.target.checked })} />
            Auto-distribute excess to missed/next months
          </label>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
            <Btn t={t} variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
            <Btn t={t} onClick={handleSave}>Save Contribution</Btn>
          </div>
        </Modal>
      )}

      {/* Excel preview & confirm modal */}
      {modal === "xlpreview" && xlPreview && (
        <Modal title="Confirm Excel Import" onClose={() => { setModal(null); setXlPreview(null); }} t={t}>
          <div style={{ fontSize: 13, color: t.textSub, marginBottom: 14 }}>
            The following contributions will be <strong style={{ color: t.text }}>merged</strong> into existing records. Existing values for the same member + month will be <strong style={{ color: "#e07b39" }}>overwritten</strong>.
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto", marginBottom: 16 }}>
            {xlPreview.map(({ member, updates }) => (
              <div key={member.id} style={{ padding: "10px 0", borderBottom: `1px solid ${t.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <Avatar initials={member.avatar} size={28} color={member.role} />
                  <strong style={{ color: t.text, fontSize: 14 }}>{member.name}</strong>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {Object.entries(updates).map(([mo, amt]) => (
                    <span key={mo} style={{ background: t.successBg, color: "#2d7d46", borderRadius: 8, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
                      {mo}: {fmtKES(amt)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn t={t} variant="ghost" onClick={() => { setModal(null); setXlPreview(null); }}>Cancel</Btn>
            <Btn t={t} onClick={applyXlPreview}>Confirm Import ({xlPreview.length} members)</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function LoansView({ members, loans, setLoans, loanRequests, setLoanRequests, currentUser, t }) {
  const [modal,        setModal]        = useState(null);
  const [form,         setForm]         = useState({ amount: "", purpose: "", application_date: new Date().toISOString().split("T")[0] });
  const [repayForm,    setRepayForm]    = useState({ loanId: "", amount: "" });
  const [approveTarget, setApproveTarget] = useState(null); // loan request being approved
  const [approveForm,   setApproveForm]   = useState({ approval_date: new Date().toISOString().split("T")[0], due_date: "" });
  const [editDatesTarget, setEditDatesTarget] = useState(null);
  const [editDatesForm,   setEditDatesForm]   = useState({ date: "", approval_date: "", due_date: "" });
  const canManage = isPrivileged(currentUser.role);
  const memberName = (id) => members.find(m => m.id === id)?.name || "Unknown";

  const handleRequestLoan = async () => {
    let amt = Number(form.amount);
    if (!amt || amt <= 0 || !form.purpose) return;
    amt = Math.min(amt, 100000000); // 100M clip
    const appDate = form.application_date || new Date().toISOString().split("T")[0];
    try {
      const { createLoan } = await import("./supabase");
      const newLoan = await createLoan({ member_id: currentUser.id, amount: amt, purpose: form.purpose, status: "pending", interest_rate: INTEREST_RATE, paid: 0, date: appDate });
      setLoanRequests(prev => [...prev, newLoan]);
      setModal(null); setForm({ amount: "", purpose: "", application_date: new Date().toISOString().split("T")[0] });
      showToast("Loan request submitted for approval.");
    } catch (err) {
      showToast("Request failed: " + err.message, "error");
    }
  };

  const openApproveModal = (req) => {
    const defaultDue = new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0];
    setApproveTarget(req);
    setApproveForm({ approval_date: new Date().toISOString().split("T")[0], due_date: defaultDue });
    setModal("approve");
  };

  const handleApproveLoan = async () => {
    if (!approveTarget) return;
    const req = approveTarget;
    const dueDate = approveForm.due_date || new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0];
    const approvalDate = approveForm.approval_date || new Date().toISOString().split("T")[0];
    try {
      const { updateLoan } = await import("./supabase");
      const updated = await updateLoan(req.id, { status: "active", due_date: dueDate, approved_by: currentUser.id, approval_date: approvalDate });
      setLoans(prev => [...prev, updated]);
      setLoanRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: "active" } : r));
      setModal(null); setApproveTarget(null);
      showToast("Loan approved successfully.");
    } catch (err) {
      showToast("Approval failed: " + err.message, "error");
    }
  };

  const openEditDates = (loan) => {
    setEditDatesTarget(loan);
    setEditDatesForm({
      date:          loan.date          || "",
      approval_date: loan.approval_date  || "",
      due_date:      loan.due_date       || "",
    });
    setModal("editdates");
  };

  const handleSaveDates = async () => {
    if (!editDatesTarget) return;
    const updates = {};
    if (editDatesForm.date)          updates.date          = editDatesForm.date;
    if (editDatesForm.approval_date) updates.approval_date = editDatesForm.approval_date;
    if (editDatesForm.due_date)      updates.due_date      = editDatesForm.due_date;
    try {
      const { updateLoan } = await import("./supabase");
      const updated = await updateLoan(editDatesTarget.id, updates);
      setLoans(prev => prev.map(l => l.id === editDatesTarget.id ? { ...l, ...updated } : l));
      setModal(null); setEditDatesTarget(null);
      showToast("Loan dates updated successfully.");
    } catch (err) {
      showToast("Update failed: " + err.message, "error");
    }
  };

  const handleReject = async (req) => {
    try {
      const { updateLoan } = await import("./supabase");
      await updateLoan(req.id, { status: "rejected" });
      setLoanRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: "rejected" } : r));
      showToast("Loan rejected.");
    } catch (err) {
      showToast("Reject failed: " + err.message, "error");
    }
  };

  const handleRepay = async () => {
    let amt = Number(repayForm.amount);
    if (!repayForm.loanId || !amt || amt <= 0) return;
    amt = Math.min(amt, 100000000);
    try {
      const { addRepayment, updateLoan } = await import("./supabase");
      await addRepayment(repayForm.loanId, amt, currentUser.id);
      const loan = loans.find(l => l.id === repayForm.loanId);
      if (loan) {
        const newPaid = loan.paid + amt;
        const newStatus = loanBalance({ ...loan, paid: newPaid }) <= 0 ? "completed" : "active";
        await updateLoan(repayForm.loanId, { paid: newPaid, status: newStatus });
        setLoans(prev => prev.map(l => l.id === repayForm.loanId ? { ...l, paid: newPaid, status: newStatus } : l));
      }
      setModal(null); setRepayForm({ loanId: "", amount: "" });
      showToast("Repayment recorded successfully.");
    } catch (err) {
      showToast("Repayment failed: " + err.message, "error");
    }
  };

  const pendingRequests = loanRequests.filter(r => r.status === "pending");
  const visibleLoans    = canManage ? loans : loans.filter(l => l.member_id === currentUser.id);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: t.text }}>Loans</h2>
          <p style={{ color: t.textSub, margin: "4px 0 0", fontSize: 13 }}>Interest rate: {INTEREST_RATE * 100}% per month</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {canManage && <Btn t={t} variant="ghost" small onClick={() => setModal("repay")}>Record Repayment</Btn>}
          <Btn t={t} onClick={() => setModal("request")}>Request Loan</Btn>
        </div>
      </div>

      {canManage && pendingRequests.length > 0 && (
        <div style={{ background: t.warningBg, border: `1.5px solid ${t.warningBorder}`, borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 800, color: t.warningText }}>⏳ Pending Approvals ({pendingRequests.length})</h3>
          {pendingRequests.map(req => (
            <div key={req.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${t.warningBorder}` }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: t.text }}>{memberName(req.member_id)} — {fmtKES(req.amount)}</div>
                <div style={{ fontSize: 12, color: t.textSub }}>{req.purpose} · {req.date}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn t={t} variant="danger" small onClick={() => handleReject(req)}>Reject</Btn>
                <Btn t={t} small onClick={() => openApproveModal(req)}>Approve</Btn>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 800, color: t.textSub, textTransform: "uppercase", letterSpacing: 0.8 }}>Active Loans</h3>
        {visibleLoans.filter(l => l.status === "active").map(loan => {
          const balance  = loanBalance(loan);
          const months   = Math.ceil((new Date() - new Date(loan.date)) / (1000 * 60 * 60 * 24 * 30));
          const interest = loan.amount * loan.interest_rate * Math.max(months, 1);
          const pct      = Math.min(100, (loan.paid / (loan.amount + interest)) * 100);
          return (
            <div key={loan.id} style={{ background: t.surface, borderRadius: 16, padding: 20, marginBottom: 12, boxShadow: t.cardShadow, border: `1px solid ${t.border}`, borderLeft: "4px solid #e07b39" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: t.text }}>{memberName(loan.member_id)}</div>
                  <div style={{ fontSize: 13, color: t.textSub }}>{loan.purpose} · Approved by {loan.approved_by}</div>
                  <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>Applied: {loan.date}{loan.approval_date ? ` · Approved: ${loan.approval_date}` : ''} · Due: {loan.due_date}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, fontSize: 20, color: "#e05a5a" }}>{fmtKES(balance)}</div>
                    <div style={{ fontSize: 12, color: t.textMuted }}>outstanding</div>
                  </div>
                  {canManage && (
                    <button onClick={() => openEditDates(loan)} style={{ background: "none", border: `1px solid ${t.border}`, borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: t.textSub, cursor: "pointer", whiteSpace: "nowrap" }}>
                      ✏ Edit Dates
                    </button>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 16, fontSize: 13, marginBottom: 10, flexWrap: "wrap" }}>
                <span style={{ color: t.textSub }}>Principal: <strong style={{ color: t.text }}>{fmtKES(loan.amount)}</strong></span>
                <span style={{ color: "#c8a84b" }}>Interest: <strong>{fmtKES(interest)}</strong></span>
                <span style={{ color: "#2d7d46" }}>Paid: <strong>{fmtKES(loan.paid)}</strong></span>
              </div>
              <div style={{ background: t.surface3, borderRadius: 8, height: 6, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: "#2d7d46", borderRadius: 8 }} />
              </div>
              <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>{pct.toFixed(0)}% repaid</div>
            </div>
          );
        })}
      </div>

      {visibleLoans.filter(l => l.status === "completed").length > 0 && (
        <div>
          <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 800, color: t.textSub, textTransform: "uppercase", letterSpacing: 0.8 }}>Completed Loans</h3>
          {visibleLoans.filter(l => l.status === "completed").map(loan => (
            <div key={loan.id} style={{ background: t.completedLoanBg, borderRadius: 14, padding: 16, marginBottom: 10, borderLeft: "4px solid #2d7d46", display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${t.border}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: t.completedLoanText }}>{memberName(loan.member_id)} — {loan.purpose}</div>
                <div style={{ fontSize: 12, color: t.textMuted }}>Applied: {loan.date}{loan.approval_date ? ` · Approved: ${loan.approval_date}` : ''} · {fmtKES(loan.amount)} original</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                {canManage && (
                  <button onClick={() => openEditDates(loan)} style={{ background: "none", border: `1px solid ${t.border}`, borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: t.textSub, cursor: "pointer" }}>
                    ✏ Edit Dates
                  </button>
                )}
                <span style={{ background: t.successBg, color: "#2d7d46", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>✓ Cleared</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal === "request" && (
        <Modal title="Request a Loan" onClose={() => setModal(null)} t={t}>
          <div style={{ background: t.surface2, borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13, color: t.textSub, border: `1px solid ${t.border}` }}>
            💡 Your request will be reviewed and approved by the Chairman before disbursement.
          </div>
          <Input t={t} label="Amount (KES)" type="number" placeholder="10000" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
          <Input t={t} label="Purpose" placeholder="e.g. Business capital, Medical, School fees" value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} />
          <Input t={t} label="Application Date" type="date" value={form.application_date} onChange={e => setForm({ ...form, application_date: e.target.value })} />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <Btn t={t} variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
            <Btn t={t} onClick={handleRequestLoan}>Submit Request</Btn>
          </div>
        </Modal>
      )}

      {modal === "approve" && approveTarget && (
        <Modal title="Approve Loan" onClose={() => { setModal(null); setApproveTarget(null); }} t={t}>
          <div style={{ background: t.surface2, borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13, color: t.textSub, border: `1px solid ${t.border}` }}>
            <div style={{ fontWeight: 700, color: t.text, marginBottom: 4 }}>{memberName(approveTarget.member_id)} — {fmtKES(approveTarget.amount)}</div>
            <div>{approveTarget.purpose}</div>
            <div style={{ marginTop: 4, fontSize: 12 }}>Applied: {approveTarget.date}</div>
          </div>
          <Input t={t} label="Approval Date" type="date" value={approveForm.approval_date} onChange={e => setApproveForm({ ...approveForm, approval_date: e.target.value })} />
          <Input t={t} label="Due Date" type="date" value={approveForm.due_date} onChange={e => setApproveForm({ ...approveForm, due_date: e.target.value })} />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <Btn t={t} variant="ghost" onClick={() => { setModal(null); setApproveTarget(null); }}>Cancel</Btn>
            <Btn t={t} onClick={handleApproveLoan}>✓ Confirm Approval</Btn>
          </div>
        </Modal>
      )}

      {modal === "repay" && (
        <Modal title="Record Loan Repayment" onClose={() => setModal(null)} t={t}>
          <Select label="Loan" t={t} value={repayForm.loanId} onChange={e => setRepayForm({ ...repayForm, loanId: e.target.value })}>
            <option value="">Select active loan...</option>
            {loans.filter(l => l.status === "active").map(l => (
              <option key={l.id} value={l.id}>{memberName(l.member_id)} — {fmtKES(loanBalance(l))} outstanding</option>
            ))}
          </Select>
          <Input t={t} label="Repayment Amount (KES)" type="number" placeholder="5000" value={repayForm.amount} onChange={e => setRepayForm({ ...repayForm, amount: e.target.value })} />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <Btn t={t} variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
            <Btn t={t} onClick={handleRepay}>Record Payment</Btn>
          </div>
        </Modal>
      )}

      {modal === "editdates" && editDatesTarget && (
        <Modal title="Edit Loan Dates" onClose={() => { setModal(null); setEditDatesTarget(null); }} t={t}>
          <div style={{ background: t.surface2, borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13, color: t.textSub, border: `1px solid ${t.border}` }}>
            <div style={{ fontWeight: 700, color: t.text, marginBottom: 2 }}>{memberName(editDatesTarget.member_id)} — {fmtKES(editDatesTarget.amount)}</div>
            <div style={{ fontSize: 12 }}>{editDatesTarget.purpose}</div>
          </div>
          <Input t={t} label="Application Date" type="date" value={editDatesForm.date} onChange={e => setEditDatesForm({ ...editDatesForm, date: e.target.value })} />
          <Input t={t} label="Approval Date" type="date" value={editDatesForm.approval_date} onChange={e => setEditDatesForm({ ...editDatesForm, approval_date: e.target.value })} />
          <Input t={t} label="Due Date" type="date" value={editDatesForm.due_date} onChange={e => setEditDatesForm({ ...editDatesForm, due_date: e.target.value })} />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <Btn t={t} variant="ghost" onClick={() => { setModal(null); setEditDatesTarget(null); }}>Cancel</Btn>
            <Btn t={t} onClick={handleSaveDates}>💾 Save Changes</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Member form sub-components (must live outside MembersView) ──────────────
function MemberField({ label, error, t, ...props }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: error ? "#e05a5a" : t.textSub, marginBottom: 4, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</label>
      <input {...props} style={{ width: "100%", padding: "9px 13px", border: `1.5px solid ${error ? "#e05a5a" : t.border}`, borderRadius: 9, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit", background: t.inputBg, color: t.text }}
        onFocus={e => e.target.style.borderColor = error ? "#e05a5a" : "#2d7d46"}
        onBlur={e => e.target.style.borderColor = error ? "#e05a5a" : t.border} />
      {error && <div style={{ fontSize: 11, color: "#e05a5a", marginTop: 3 }}>{error}</div>}
    </div>
  );
}

function MemberForm({ form, setForm, errors, t, onSave, onCancel, saveLabel, setModal, setErrors }) {
  const cancel = onCancel || (() => { setModal(null); setErrors({}); });
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <MemberField t={t} label="Full Name *" placeholder="e.g. Jane Muthoni Kamau" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} error={errors.name} />
        </div>
        <MemberField t={t} label="Phone *" placeholder="0712345678" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} error={errors.phone} />
        <MemberField t={t} label="National ID / Passport *" placeholder="e.g. 12345678" value={form.idNumber} onChange={e => setForm({ ...form, idNumber: e.target.value })} error={errors.idNumber} />
        <MemberField t={t} label="Email (optional)" type="email" placeholder="jane@email.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        <MemberField t={t} label="Join Date *" type="date" value={form.joinDate} onChange={e => setForm({ ...form, joinDate: e.target.value })} error={errors.joinDate} />
        <MemberField t={t} label="Next of Kin" placeholder="Full name" value={form.nextOfKin} onChange={e => setForm({ ...form, nextOfKin: e.target.value })} />
        <MemberField t={t} label="Next of Kin Phone" placeholder="07XXXXXXXX" value={form.nextOfKinPhone} onChange={e => setForm({ ...form, nextOfKinPhone: e.target.value })} />
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
        <Btn t={t} variant="ghost" onClick={cancel}>Cancel</Btn>
        <Btn t={t} onClick={onSave}>{saveLabel}</Btn>
      </div>
    </>
  );
}

function MembersView({ members, setMembers, contributions, loans, currentUser, t, isMobile }) {
  const isAdmin = currentUser.role === "admin";
  const privileged = isPrivileged(currentUser.role);
  // Regular members only see their own card; Admins see all APPROVED members here (Pending in own section)
  const visibleMembers = privileged 
    ? members.filter(m => m.status === "approved") 
    : members.filter(m => m.id === currentUser.id && m.status === "approved");

  const EMPTY_FORM = { name: "", phone: "", email: "", idNumber: "", joinDate: new Date().toISOString().split("T")[0], nextOfKin: "", nextOfKinPhone: "" };
  const [modal,        setModal]        = useState(null); // "enroll"|"edit"|"remove"|"role"|null
  const [form,         setForm]         = useState(EMPTY_FORM);
  const [editTarget,   setEditTarget]   = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [roleTarget,   setRoleTarget]   = useState(null);
  const [assignedRole, setAssignedRole] = useState("member");
  const [errors,       setErrors]       = useState({});
  const [success,      setSuccess]      = useState("");

  const mkInitials = (name) => name.trim().split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  const validate = () => {
    const e = {};
    if (!form.name.trim())    e.name     = "Full name is required";
    if (!form.phone.trim())   e.phone    = "Phone number is required";
    if (!/^0[0-9]{9}$/.test(form.phone.trim())) e.phone = "Enter a valid Kenyan number (e.g. 0712345678)";
    if (!form.idNumber.trim()) e.idNumber = "ID / Passport number is required";
    if (!form.joinDate)        e.joinDate = "Join date is required";
    return e;
  };

  const handleEnroll = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    const nm = {
      name: form.name.trim(), phone: form.phone.trim(),
      email: form.email.trim() || null, id_number: form.idNumber.trim(),
      role: "member",
      join_date: form.joinDate,
      next_of_kin: form.nextOfKin.trim() || null, nok_phone: form.nextOfKinPhone.trim() || null,
      avatar: mkInitials(form.name), enrolled_by: currentUser.id,
    };
    try {
      const { createMember } = await import("./supabase");
      const saved = await createMember(nm);
      setMembers(prev => [...prev, saved]);
      showToast(`${saved.name} enrolled as Member. You can now assign their role using the 🏷 button.`);
      setSuccess(`${saved.name} enrolled as Member. You can now assign their role using the 🏷 button.`);
    } catch (err) {
      setErrors({ name: err.message || "Failed to enroll member." });
      return;
    }
    setErrors({}); setModal(null); setForm(EMPTY_FORM);
    setTimeout(() => setSuccess(""), 6000);
  };

  const handleEdit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    const updates = {
      name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() || null,
      id_number: form.idNumber.trim(), join_date: form.joinDate,
      next_of_kin: form.nextOfKin.trim() || null, nok_phone: form.nextOfKinPhone.trim() || null,
      avatar: mkInitials(form.name),
    };
    try {
      const { updateMember } = await import("./supabase");
      const saved = await updateMember(editTarget.id, updates);
      setMembers(prev => prev.map(m => m.id === editTarget.id ? saved : m));
      setModal(null); setErrors({});
      showToast("Member updated successfully.");
    } catch (err) {
      showToast("Edit failed: " + err.message, "error");
    }
  };

  const handleRemove = async () => {
    try {
      const { deleteMember } = await import("./supabase");
      await deleteMember(removeTarget.id);
      setMembers(prev => prev.filter(m => m.id !== removeTarget.id));
      setModal(null); setRemoveTarget(null);
      showToast("Member removed.");
    } catch (err) {
      showToast("Remove failed: " + err.message, "error");
    }
  };

  const handleAssignRole = async () => {
    try {
      const { updateMember } = await import("./supabase");
      await updateMember(roleTarget.id, { role: assignedRole });
      setMembers(prev => prev.map(m => m.id === roleTarget.id ? { ...m, role: assignedRole } : m));
      showToast(`Role updated to "${assignedRole}" for ${roleTarget.name}.`);
      setSuccess(`Role updated to "${assignedRole}" for ${roleTarget.name}.`);
      setModal(null); setRoleTarget(null);
      setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      showToast("Role assignment failed: " + err.message, "error");
    }
  };

  const openEdit = (member) => {
    setEditTarget(member);
    setForm({ name: member.name, phone: member.phone, email: member.email || "", idNumber: member.id_number || "", joinDate: member.join_date, nextOfKin: member.next_of_kin || "", nextOfKinPhone: member.nok_phone || "" });
    setErrors({}); setModal("edit");
  };

  const openRoleAssign = (member) => {
    setRoleTarget(member); setAssignedRole(member.role); setModal("role");
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: t.text }}>Members</h2>
          <p style={{ color: t.textSub, margin: "4px 0 0", fontSize: 13 }}>{members.length} active members</p>
        </div>
        {isAdmin && <Btn t={t} onClick={() => { setForm(EMPTY_FORM); setErrors({}); setModal("enroll"); }}>+ Enroll Member</Btn>}
      </div>

      {/* Success toast */}
      {success && (
        <div className="animate-fade-in" style={{ background: t.successBg, border: "1.5px solid #2d7d46", borderRadius: 12, padding: "11px 16px", marginBottom: 18, fontSize: 13, color: "#2d7d46", fontWeight: 700 }}>
          ✅ {success}
        </div>
      )}

      {/* Admin capability note */}
      {isAdmin && (
        <div style={{ background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 12, padding: "11px 16px", marginBottom: 18, fontSize: 13, color: t.textSub, display: "flex", gap: 10 }}>
          <span style={{ fontSize: 17 }}>🛡️</span>
          <span>As <strong style={{ color: t.text }}>Admin</strong>: enroll members (they start as <em>Member</em>), then use <strong>🏷 Assign Role</strong> to update their role. Use ✏️ to edit details or 🗑️ to remove.</span>
        </div>
      )}

      {/* Regular member: can only see their own card */}
      {!privileged && (
        <div style={{ background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 12, padding: "11px 16px", marginBottom: 18, fontSize: 13, color: t.textSub }}>
          ℹ️ You can view your own membership details below. Contact the Admin for any changes.
        </div>
      )}

      {/* Member cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 16 }}>
        {visibleMembers.map(member => {
          const contrib     = totalContrib(contributions, member.id);
          const activeLoans = loans.filter(l => l.member_id === member.id && l.status === "active");
          const totalOwed   = activeLoans.reduce((s, l) => s + loanBalance(l), 0);
          const isOwnCard   = member.id === currentUser.id;
          return (
            <div key={member.id} style={{ background: t.surface, borderRadius: 18, padding: 22, boxShadow: t.cardShadow, border: `1px solid ${t.border}` }}>
              {/* Card header */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
                <Avatar initials={member.avatar} size={48} color={member.role} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{member.name}</div>
                  <div style={{ margin: "4px 0" }}><Badge role={member.role} t={t} /></div>
                  <div style={{ fontSize: 11, color: t.textMuted }}>Since {member.join_date}</div>
                </div>
                {/* Admin controls */}
                {isAdmin && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
                    <button onClick={() => openEdit(member)} title="Edit details" style={{ background: t.surface3, border: `1px solid ${t.border}`, borderRadius: 8, padding: "4px 8px", cursor: "pointer", fontSize: 12, color: t.textSub, fontFamily: "inherit", fontWeight: 600 }}>✏️ Edit</button>
                    <button onClick={() => openRoleAssign(member)} title="Assign role" style={{ background: t.warningBg, border: `1px solid ${t.warningBorder}`, borderRadius: 8, padding: "4px 8px", cursor: "pointer", fontSize: 12, color: t.warningText, fontFamily: "inherit", fontWeight: 600 }}>🏷 Role</button>
                    {!isOwnCard && (
                      <button onClick={() => { setRemoveTarget(member); setModal("remove"); }} title="Remove member" style={{ background: t.dangerBg, border: "1px solid #e05a5a55", borderRadius: 8, padding: "4px 8px", cursor: "pointer", fontSize: 12, color: "#e05a5a", fontFamily: "inherit", fontWeight: 600 }}>🗑️ Remove</button>
                    )}
                  </div>
                )}
              </div>

              {/* Details — privileged see all, regular only see own */}
              {(privileged || isOwnCard) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {[
                    { label: "Phone",             val: member.phone,       color: t.text },
                    { label: "Total Contributed", val: fmtKES(contrib),    color: "#2d7d46" },
                    // Loan count only shown to privileged; regular members see their own
                    ...(privileged || isOwnCard ? [{ label: "Active Loans", val: activeLoans.length, color: activeLoans.length > 0 ? "#e07b39" : "#2d7d46" }] : []),
                  ].map(row => (
                    <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 11px", background: t.infoRowBg, borderRadius: 9 }}>
                      <span style={{ fontSize: 12, color: t.textSub }}>{row.label}</span>
                      <span style={{ fontWeight: 700, color: row.color, fontSize: 12 }}>{row.val}</span>
                    </div>
                  ))}
                  {/* Outstanding balance: privileged always; regular only own */}
                  {totalOwed > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 11px", background: t.dangerBg, borderRadius: 9 }}>
                      <span style={{ fontSize: 12, color: t.textSub }}>Outstanding Balance</span>
                      <span style={{ fontWeight: 800, color: "#e05a5a", fontSize: 12 }}>{fmtKES(totalOwed)}</span>
                    </div>
                  )}
                  {member.email && (
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 11px", background: t.infoRowBg, borderRadius: 9 }}>
                      <span style={{ fontSize: 12, color: t.textSub }}>Email</span>
                      <span style={{ fontWeight: 600, color: t.text, fontSize: 12 }}>{member.email}</span>
                    </div>
                  )}
                  {member.next_of_kin && (
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 11px", background: t.infoRowBg, borderRadius: 9 }}>
                      <span style={{ fontSize: 12, color: t.textSub }}>Next of Kin</span>
                      <span style={{ fontWeight: 600, color: t.text, fontSize: 12 }}>{member.next_of_kin}</span>
                    </div>
                  )}
                  {member.enrolled_by && (
                    <div style={{ fontSize: 11, color: t.textMuted, textAlign: "right", marginTop: 3 }}>Enrolled by {member.enrolled_by}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Pending Approvals Section — captures anyone not approved/rejected */}
        {privileged && members.some(m => m.status !== "approved" && m.status !== "rejected") && (
          <div style={{ marginTop: 32, marginBottom: 16 }}>
             <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 800, color: "#e07b39", textTransform: "uppercase", letterSpacing: 0.8, display: "flex", alignItems: "center", gap: 10 }}>
               <span style={{ fontSize: 18 }}>⏳</span> Pending Approvals
             </h3>
             <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
               {members.filter(m => m.status !== "approved" && m.status !== "rejected").map(member => (
                 <div key={member.id} style={{ background: t.surface, borderRadius: 16, padding: 16, boxShadow: t.cardShadow, border: "2px solid #e07b39" }}>
                   <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                     <Avatar initials={member.avatar} size={40} color={member.role} />
                     <div style={{ flex: 1, minWidth: 0 }}>
                       <div style={{ fontWeight: 800, fontSize: 15, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{member.name}</div>
                       <div style={{ fontSize: 12, color: t.textSub }}>Joined {member.join_date}</div>
                     </div>
                   </div>
                   <div style={{ display: "flex", gap: 8 }}>
                     <Btn t={t} small variant="ghost" style={{ flex: 1 }} onClick={async () => {
                       const { updateMember } = await import("./supabase");
                       await updateMember(member.id, { status: "rejected" });
                       setMembers(prev => prev.map(m => m.id === member.id ? { ...m, status: "rejected" } : m));
                     }}>Deny</Btn>
                     <Btn t={t} small style={{ flex: 1 }} onClick={async () => {
                       const { updateMember } = await import("./supabase");
                       await updateMember(member.id, { status: "approved" });
                       setMembers(prev => prev.map(m => m.id === member.id ? { ...m, status: "approved" } : m));
                     }}>Approve</Btn>
                   </div>
                 </div>
               ))}
             </div>
          </div>
        )}
      </div>

      {/* Enroll Modal — no role selector; always starts as Member */}
      {modal === "enroll" && (
        <Modal title="Enroll New Member" onClose={() => { setModal(null); setErrors({}); }} t={t}>
          <div style={{ background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: t.textSub }}>
            🛡️ New members are enrolled as <strong>Member</strong> by default. After enrolling, use <strong>🏷 Assign Role</strong> on their card to change their role.
          </div>
          <div style={{ maxHeight: "58vh", overflowY: "auto", paddingRight: 4 }}>
            <MemberForm form={form} setForm={setForm} errors={errors} t={t} onSave={handleEnroll} setModal={setModal} setErrors={setErrors} saveLabel="Enroll Member" />
          </div>
        </Modal>
      )}

      {/* Edit Modal */}
      {modal === "edit" && (
        <Modal title={`Edit — ${editTarget?.name}`} onClose={() => { setModal(null); setErrors({}); }} t={t}>
          <div style={{ maxHeight: "58vh", overflowY: "auto", paddingRight: 4 }}>
            <MemberForm form={form} setForm={setForm} errors={errors} t={t} onSave={handleEdit} setModal={setModal} setErrors={setErrors} saveLabel="Save Changes" />
          </div>
        </Modal>
      )}

      {/* Assign Role Modal */}
      {modal === "role" && roleTarget && (
        <Modal title={`Assign Role — ${roleTarget.name}`} onClose={() => setModal(null)} t={t}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22, padding: 14, background: t.surface2, borderRadius: 12, border: `1px solid ${t.border}` }}>
            <Avatar initials={roleTarget.avatar} size={44} color={roleTarget.role} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: t.text }}>{roleTarget.name}</div>
              <div style={{ fontSize: 13, color: t.textSub, marginTop: 2 }}>Current role: <Badge role={roleTarget.role} t={t} /></div>
            </div>
          </div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.textSub, marginBottom: 8, letterSpacing: 0.5, textTransform: "uppercase" }}>Assign New Role</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 22 }}>
            {["member","treasurer","chairman","admin"].map(r => {
              const roleColors = { chairman: "#c8a84b", treasurer: "#2d7d46", admin: "#5b9bd5", member: t.textSub };
              const selected = assignedRole === r;
              return (
                <button key={r} onClick={() => setAssignedRole(r)} style={{
                  padding: "12px 10px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 13,
                  background: selected ? roleColors[r] + "22" : t.surface3,
                  border: `2px solid ${selected ? roleColors[r] : t.border}`,
                  color: selected ? roleColors[r] : t.textSub,
                  textTransform: "capitalize", transition: "all 0.15s",
                }}>{r}</button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn t={t} variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
            <Btn t={t} onClick={handleAssignRole}>Assign Role</Btn>
          </div>
        </Modal>
      )}

      {/* Remove Confirmation */}
      {modal === "remove" && removeTarget && (
        <Modal title="Remove Member?" onClose={() => setModal(null)} t={t}>
          <div style={{ textAlign: "center", padding: "8px 0 22px" }}>
            <Avatar initials={removeTarget.avatar} size={56} color={removeTarget.role} />
            <div style={{ fontWeight: 800, fontSize: 17, color: t.text, marginTop: 12 }}>{removeTarget.name}</div>
            <div style={{ fontSize: 13, color: t.textSub, marginTop: 8, lineHeight: 1.5 }}>This will remove them from the chama. Existing contribution and loan records are preserved for accounting.</div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn t={t} variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
            <Btn t={t} variant="danger" onClick={handleRemove}>Yes, Remove</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}



function MpesaView({ t }) {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: t.text }}>M-Pesa Integration</h2>
        <p style={{ color: t.textSub, margin: "4px 0 0", fontSize: 13 }}>Safaricom Daraja API — configuration &amp; status</p>
      </div>
      <div style={{ background: t.surface, borderRadius: 20, padding: 32, boxShadow: t.cardShadow, maxWidth: 560, border: `1px solid ${t.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "#00b83f", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 28 }}>📱</span>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: t.text }}>M-Pesa Daraja API</div>
            <div style={{ fontSize: 13, color: t.textSub }}>Real-time payment tracking &amp; STK Push</div>
          </div>
          <span style={{ marginLeft: "auto", background: t.warningBg, color: "#c8a84b", padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>Not Connected</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
          {[
            { icon: "✅", label: "STK Push Payments",   desc: "Auto-trigger payment prompts to members"       },
            { icon: "✅", label: "C2B Listener",         desc: "Auto-log contributions from M-Pesa transactions" },
            { icon: "✅", label: "Transaction Matching", desc: "Match M-Pesa refs to member accounts"          },
            { icon: "✅", label: "SMS Notifications",    desc: "Receipt confirmations via SMS"                 },
          ].map(f => (
            <div key={f.label} style={{ display: "flex", gap: 14, padding: 14, background: t.surface2, borderRadius: 12, border: `1px solid ${t.border}` }}>
              <span style={{ fontSize: 20 }}>{f.icon}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: t.text }}>{f.label}</div>
                <div style={{ fontSize: 12, color: t.textSub }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 24 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 16, color: t.text }}>Configuration</div>
          <Input t={t} label="Consumer Key"         placeholder="Paste your Daraja consumer key" />
          <Input t={t} label="Consumer Secret"      type="password" placeholder="••••••••••••••••" />
          <Input t={t} label="Paybill / Till Number" placeholder="e.g. 400200" />
          <Input t={t} label="Passkey"              type="password" placeholder="••••••••••••••••" />
          <Btn t={t} style={{ width: "100%" }}>Connect M-Pesa</Btn>
          <p style={{ fontSize: 12, color: t.textMuted, textAlign: "center", marginTop: 12 }}>
            Don't have Daraja credentials?{" "}
            <a href="https://developer.safaricom.co.ke" target="_blank" rel="noreferrer" style={{ color: "#2d7d46", fontWeight: 700 }}>Apply at Safaricom Developer Portal →</a>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Complete Profile View ──────────────────────────────────────────────────
function CompleteProfile({ session, onComplete, onSignOut, t }) {
  const [form, setForm] = useState({ name: "", phone: "", idNumber: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleComplete = async (e) => {
    e.preventDefault();
    if (!form.name || !form.phone || !form.idNumber) {
      setError("Please fill all fields");
      return;
    }
    try {
      setLoading(true);
      setError("");
      const { createMember } = await import("./supabase");
      await createMember({
        auth_id: session.user.id,
        name: form.name.trim(),
        phone: form.phone.trim(),
        id_number: form.idNumber.trim(),
        email: session.user.email,
        role: "member",
        status: "pending", // New members must be approved
        join_date: new Date().toISOString().split("T")[0],
      });
      onComplete(); 
    } catch (err) {
      setError(err.message || "Failed to create profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ background: t.surface, borderRadius: 20, padding: 32, width: "100%", maxWidth: 420, boxShadow: t.cardShadow, border: `1px solid ${t.border}` }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 800, color: t.text }}>Complete Profile</h2>
        <p style={{ color: t.textSub, fontSize: 14, margin: "0 0 24px" }}>Welcome! Please provide your details to finish setting up your ChamaHive account.</p>
        
        {error && <div style={{ background: t.dangerBg, color: "#e05a5a", padding: 12, borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>}
        
        <form onSubmit={handleComplete}>
          <Input t={t} label="Full Name" placeholder="Jane Doe" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          <Input t={t} label="Phone Number" placeholder="07XXXXXXX" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required />
          <Input t={t} label="National ID" placeholder="12345678" value={form.idNumber} onChange={e => setForm({ ...form, idNumber: e.target.value })} required />
          
          <Btn t={t} style={{ width: "100%", marginTop: 12 }} disabled={loading}>
            {loading ? "Saving..." : "Complete Profile"}
          </Btn>
        </form>
        
        <button onClick={onSignOut} style={{ background: "none", border: "none", color: t.textSub, fontSize: 13, marginTop: 24, width: "100%", cursor: "pointer", fontWeight: 700 }}>
          Sign Out
        </button>
      </div>
    </div>
  );
}

// ─── App Shell ────────────────────────────────────────────────────────────────
// ─── Responsive hook ─────────────────────────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

// ─── Sidebar content — top-level so React can track it correctly ─────────────
function SidebarContent({ t, isMobile, view, navItems, pendingCount, currentUser, navigate, onSignOut, setDrawerOpen }) {
  return (
    <>
      {/* Logo */}
      <div style={{ padding: "0 20px 24px", borderBottom: `1px solid ${t.sidebarBorder}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: "#2d7d46", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🌿</div>
          <div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 15, letterSpacing: 0.3 }}>ChamaHive</div>
            <div style={{ color: t.sidebarSub, fontSize: 11, fontWeight: 600 }}>Sacco Manager</div>
          </div>
        </div>
        {isMobile && (
          <button onClick={() => setDrawerOpen(false)} style={{ background: "none", border: "none", color: t.sidebarText, fontSize: 22, cursor: "pointer", lineHeight: 1 }}>✕</button>
        )}
      </div>

      {/* Nav links */}
      <div style={{ flex: 1, padding: "14px 10px", overflowY: "auto" }}>
        {navItems.map(item => (
          <button key={item.id} onClick={() => navigate(item.id)} style={{
            display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "11px 14px",
            background: view === item.id ? t.sidebarActive : "transparent",
            color: view === item.id ? "#fff" : t.sidebarText,
            border: "none", borderRadius: 12, cursor: "pointer", marginBottom: 3,
            fontSize: 14, fontWeight: 700, fontFamily: "inherit", transition: "all 0.15s", textAlign: "left",
          }}>
            <span style={{ fontSize: 18 }}>{item.icon}</span>
            {item.label}
            {item.id === "loans" && pendingCount > 0 && (
              <span style={{ marginLeft: "auto", background: "#c8a84b", color: "#fff", borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 800 }}>{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Logged-in user + sign out */}
      <div style={{ padding: "14px 12px", borderTop: `1px solid ${t.sidebarBorder}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", marginBottom: 8, background: t.sidebarUserActive, borderRadius: 10, border: `1px solid ${t.sidebarUserBorder}` }}>
          <Avatar initials={currentUser?.avatar || "??"} size={30} color={currentUser?.role} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.sidebarUserText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{currentUser?.name}</div>
            <div style={{ fontSize: 10, color: t.sidebarSub, textTransform: "capitalize" }}>{currentUser?.role}</div>
          </div>
        </div>
        <button onClick={onSignOut} style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 14px",
          background: "transparent", color: "#e05a5a", border: "1px solid rgba(224,90,90,0.3)",
          borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700,
          fontFamily: "inherit", transition: "all 0.15s",
        }}>
          🚪 Sign Out
        </button>
      </div>
    </>
  );
}

// ─── App Shell ────────────────────────────────────────────────────────────────
export default function ChamaApp({ session }) {
  const [darkMode,      setDarkMode]      = useState(false);
  const [currentUser,   setCurrentUser]   = useState(null);
  const [view,          setView]          = useState("dashboard");
  const [members,       setMembers]       = useState([]);
  const [contributions, setContributions] = useState([]);
  const [loans,         setLoans]         = useState([]);
  const [loanRequests,  setLoanRequests]  = useState([]);
  const [drawerOpen,    setDrawerOpen]    = useState(false);
  const [appLoading,    setAppLoading]    = useState(true);
  const [appError,      setAppError]      = useState("");
  const [needsProfile,  setNeedsProfile]  = useState(false);
  const [isWaitingApproval, setIsWaitingApproval] = useState(false);
  const [isRejected,        setIsRejected]        = useState(false);
  const [activeYear,    setActiveYear]    = useState(2026);

  const t        = THEMES[darkMode ? "dark" : "light"];
  const isMobile = useIsMobile();

  // ── 1-Minute Inactivity Auto-Logout ───────────────────────────────────────
  useEffect(() => {
    let timeoutId;
    
    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        signOut();
      }, 60000); // 1 minute
    };

    const events = ["mousedown", "mousemove", "keypress", "scroll", "touchstart"];
    events.forEach(name => document.addEventListener(name, resetTimer));
    
    // Initial start
    resetTimer();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach(name => document.removeEventListener(name, resetTimer));
    };
  }, [session]);

  // ── Load all data from Supabase ───────────────────────────────────────────
  const loadData = async (showLoading = true) => {
    try {
      if (showLoading) setAppLoading(true);
      
      // 1. Get/Refresh profile
      let profile;
      try {
        profile = await fetchProfile(session.user.id);
      } catch (err) {
        setNeedsProfile(true);
        return;
      }

      if (profile && profile.status === "approved") {
        setCurrentUser(profile);
      } else if (profile && profile.status === "rejected") {
        setIsRejected(true);
        return;
      } else {
        setIsWaitingApproval(true);
        return;
      }

      // 2. Load members
      const membersData = await fetchMembers();
      setMembers(membersData);

      // 3. Load contributions for all years
      const contribData = await fetchContributions(null);
      setContributions(contribData);

      // 4. Load loans
      const loansData = await fetchLoans();
      setLoans(loansData.filter(l => l.status !== "pending"));
      setLoanRequests(loansData.filter(l => l.status === "pending"));

    } catch (e) {
      setAppError(e.message || "Failed to load data. Please refresh.");
    } finally {
      if (showLoading && !needsProfile) setAppLoading(false);
    }
  };

  // ── Initial Load & Realtime Subscription ───────────────────────────────────
  useEffect(() => {
    loadData();
    
    // Set up realtime listeners for members, contributions, and loans
    const channel = supabase.channel('db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () => loadData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contributions' }, () => loadData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loans' }, () => loadData(false))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, needsProfile, activeYear]);

  // ── Loading screen ─────────────────────────────────────────────────────────
  if (appLoading) return (
    <div className="animate-fade-in" style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div className="animate-pulse" style={{ fontSize: 40, marginBottom: 16 }}>🌿</div>
        <div style={{ color: t.textSub, fontSize: 16, letterSpacing: 0.5 }}>Loading your chama…</div>
      </div>
    </div>
  );


  if (needsProfile) {
    return <CompleteProfile session={session} t={t} onComplete={() => setNeedsProfile(false)} onSignOut={async () => { await signOut(); }} />;
  }

  if (appError) return (
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
        <div style={{ color: "#e05a5a", fontSize: 15, marginBottom: 20 }}>{appError}</div>
        <button onClick={() => window.location.reload()} style={{ padding: "10px 24px", background: "#2d7d46", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 700 }}>Retry</button>
      </div>
    </div>
  );

  if (isWaitingApproval) {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ background: t.surface, borderRadius: 24, padding: "48px 32px", width: "100%", maxWidth: 440, boxShadow: t.cardShadow, border: `1px solid ${t.border}`, textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 24 }}>⏳</div>
          <h2 style={{ margin: "0 0 12px", fontSize: 26, fontWeight: 800, color: t.text }}>Account Pending Approval</h2>
          <p style={{ color: t.textSub, fontSize: 16, margin: "0 0 32px", lineHeight: 1.6 }}>
            Welcome to ChamaHive! Your profile has been created successfully. An administrator needs to approve your account before you can access the dashboard.
          </p>
          <div style={{ background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 16, padding: "16px 20px", marginBottom: 32, textAlign: "left" }}>
             <div style={{ fontSize: 13, fontWeight: 700, color: t.textSub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Next Steps</div>
             <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: t.text, lineHeight: 1.5 }}>
               <li>Notify your chama treasurer or chairman.</li>
               <li>Refresh this page once you've been approved.</li>
             </ul>
          </div>
          <Btn t={t} style={{ width: "100%" }} onClick={() => window.location.reload()}>Refresh Status</Btn>
          <button onClick={async () => await signOut()} style={{ background: "none", border: "none", color: t.textSub, fontSize: 14, marginTop: 20, cursor: "pointer", fontWeight: 700 }}>
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (isRejected) {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ background: t.surface, borderRadius: 24, padding: "48px 32px", width: "100%", maxWidth: 440, boxShadow: t.cardShadow, border: `1px solid ${t.border}`, textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 24 }}>🚫</div>
          <h2 style={{ margin: "0 0 12px", fontSize: 26, fontWeight: 800, color: "#e05a5a" }}>Access Denied</h2>
          <p style={{ color: t.textSub, fontSize: 16, margin: "0 0 32px", lineHeight: 1.6 }}>
            Your registration request for ChamaHive was denied by the administrator. Please contact your chama chairman if you believe this is an error.
          </p>
          <button onClick={async () => await signOut()} style={{ background: "#c0392b", color: "#fff", border: "none", borderRadius: 12, padding: "14px 28px", cursor: "pointer", fontWeight: 700, fontSize: 15, width: "100%" }}>
            Go Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  if (!currentUser) return null;

  const navItems = [
    { id: "dashboard",     icon: "📊", label: "Dashboard"     },
    { id: "contributions", icon: "💰", label: "Contributions" },
    { id: "loans",         icon: "🏦", label: "Loans"         },
    { id: "members",       icon: "👥", label: "Members"       },
    { id: "mpesa",         icon: "📱", label: "M-Pesa"        },
  ];

  const pendingCount = loanRequests.filter(r => r.status === "pending").length;
  const navigate     = (id) => { setView(id); setDrawerOpen(false); };
  const handleSignOut = async () => { await signOut(); };

  return (
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: t.bg, minHeight: "100vh", display: "flex", transition: "background 0.3s" }}>

      {/* ── DESKTOP SIDEBAR ── */}
      {!isMobile && (
        <div style={{
          width: 240, background: t.sidebar, minHeight: "100vh", display: "flex", flexDirection: "column",
          padding: "24px 0", position: "fixed", left: 0, top: 0, bottom: 0, zIndex: 100,
          boxShadow: "4px 0 24px rgba(0,0,0,0.2)",
        }}>
          <SidebarContent t={t} isMobile={false} view={view} navItems={navItems} pendingCount={pendingCount} currentUser={currentUser} navigate={navigate} onSignOut={handleSignOut} />
        </div>
      )}

      {/* ── MOBILE DRAWER OVERLAY ── */}
      {isMobile && drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200 }}
        />
      )}

      {/* ── MOBILE SLIDE-IN DRAWER ── */}
      {isMobile && (
        <div style={{
          position: "fixed", top: 0, left: 0, bottom: 0, width: 270,
          background: t.sidebar, zIndex: 300, display: "flex", flexDirection: "column",
          padding: "20px 0", transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
          boxShadow: drawerOpen ? "6px 0 32px rgba(0,0,0,0.3)" : "none",
        }}>
          <SidebarContent t={t} isMobile={true} view={view} navItems={navItems} pendingCount={pendingCount} currentUser={currentUser} navigate={navigate} onSignOut={handleSignOut} setDrawerOpen={setDrawerOpen} />
        </div>
      )}

      {/* ── MOBILE TOP BAR ── */}
      {isMobile && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 150,
          background: t.sidebar, height: 56, display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "0 16px",
          boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
        }}>
          <button onClick={() => setDrawerOpen(true)} style={{
            background: "none", border: "none", cursor: "pointer", color: "#fff",
            display: "flex", flexDirection: "column", gap: 5, padding: 4,
          }}>
            <span style={{ display: "block", width: 22, height: 2, background: "#fff", borderRadius: 2 }} />
            <span style={{ display: "block", width: 22, height: 2, background: "#fff", borderRadius: 2 }} />
            <span style={{ display: "block", width: 22, height: 2, background: "#fff", borderRadius: 2 }} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: 8, background: "#2d7d46", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🌿</div>
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>ChamaHive</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <YearSelector activeYear={activeYear} setActiveYear={setActiveYear} style={{
              background: "rgba(255,255,255,0.1)", color: "#fff", border: "none", borderRadius: 8, padding: "4px 8px"
            }} optionStyle={{color: "#000"}} />
            <button onClick={() => setDarkMode(d => !d)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>
              {darkMode ? "☀️" : "🌙"}
            </button>
            <Avatar initials={currentUser.avatar} size={32} color={currentUser.role} />
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <div style={{
        marginLeft: isMobile ? 0 : 240,
        flex: 1,
        padding: isMobile ? "72px 16px 88px" : "32px 32px 48px",
        transition: "margin 0.3s",
        minWidth: 0,
      }}>
        <GlobalToast />
        {/* Desktop top bar */}
        {!isMobile && (
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginBottom: 28 }}>
            <YearSelector activeYear={activeYear} setActiveYear={setActiveYear} style={{
              background: t.headerCardBg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 14,
              padding: "10px 16px", boxShadow: t.cardShadow
            }} />
            <DarkModeToggle darkMode={darkMode} setDarkMode={setDarkMode} t={t} />
            <div style={{ display: "flex", alignItems: "center", gap: 12, background: t.headerCardBg, padding: "10px 16px", borderRadius: 14, boxShadow: t.cardShadow, border: `1px solid ${t.border}` }}>
              <Avatar initials={currentUser.avatar} size={34} color={currentUser.role} />
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: t.text }}>{currentUser.name}</div>
                <div style={{ fontSize: 11, color: t.textSub, textTransform: "capitalize" }}>{currentUser.role}</div>
              </div>
            </div>
          </div>
        )}

        {view === "dashboard"     && <Dashboard        members={members} contributions={contributions} loans={loans} currentUser={currentUser} activeYear={activeYear} t={t} isMobile={isMobile} />}
        {view === "contributions" && <ContributionsView members={members} contributions={contributions} setContributions={setContributions} currentUser={currentUser} activeYear={activeYear} t={t} />}
        {view === "loans"         && <LoansView         members={members} loans={loans} setLoans={setLoans} loanRequests={loanRequests} setLoanRequests={setLoanRequests} currentUser={currentUser} t={t} />}
        {view === "members"       && <MembersView       members={members} setMembers={setMembers} contributions={contributions} loans={loans} currentUser={currentUser} t={t} isMobile={isMobile} />}
        {view === "mpesa"         && <MpesaView         t={t} />}
      </div>

      {/* ── MOBILE BOTTOM NAV ── */}
      {isMobile && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 150,
          background: t.sidebar, height: 64, display: "flex", alignItems: "stretch",
          boxShadow: "0 -2px 16px rgba(0,0,0,0.2)", borderTop: `1px solid ${t.sidebarBorder}`,
        }}>
          {navItems.map(item => (
            <button key={item.id} onClick={() => navigate(item.id)} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              background: view === item.id ? "rgba(45,125,70,0.3)" : "transparent",
              border: "none", cursor: "pointer", gap: 3, position: "relative",
              borderTop: view === item.id ? "2px solid #2d7d46" : "2px solid transparent",
              transition: "all 0.15s",
            }}>
              <span style={{ fontSize: 20 }}>{item.icon}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: view === item.id ? "#7dd4a0" : t.sidebarText, letterSpacing: 0.3 }}>
                {item.label.length > 8 ? item.label.slice(0, 7) + "…" : item.label}
              </span>
              {item.id === "loans" && pendingCount > 0 && (
                <span style={{ position: "absolute", top: 6, right: "50%", transform: "translateX(12px)", background: "#c8a84b", color: "#fff", borderRadius: 10, padding: "1px 5px", fontSize: 9, fontWeight: 800 }}>{pendingCount}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}