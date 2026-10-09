import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";

export default function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword]     = useState("");
  const [showPw, setShowPw]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [busy, setBusy]             = useState(false);

  useEffect(() => {
    if (!loading && user) navigate("/dashboard", { replace: true });
  }, [loading, user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError("Please enter your username/email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(identifier.trim(), password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "#f8f9fc" }}>

      {/* ── Left panel ────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex"
        style={{
          width: "44%",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(160deg, #0f172a 0%, #1a1040 60%, #0f172a 100%)",
          padding: "52px 56px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Accent glows */}
        <div style={{
          position: "absolute", top: "-80px", right: "-80px",
          width: "360px", height: "360px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(234,179,8,0.12) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: "-60px", left: "-60px",
          width: "300px", height: "300px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(239,68,68,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", position: "relative" }}>
          <div style={{
            width: "38px", height: "38px", borderRadius: "10px",
            background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
          }}>
            <img src="/favicon.png" alt="Averix" style={{ width: "100%", height: "100%", objectFit: "contain", padding: "6px" }} />
          </div>
          <div>
            <p style={{ color: "white", fontWeight: 700, fontSize: "15px", margin: 0, letterSpacing: "-0.2px" }}>Averix Growth</p>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "11px", margin: 0, letterSpacing: "0.5px" }}>Admin Portal</p>
          </div>
        </div>

        {/* Main copy */}
        <div style={{ position: "relative" }}>
          <p style={{
            display: "inline-block",
            fontSize: "11px", fontWeight: 600, letterSpacing: "2px",
            textTransform: "uppercase", color: "rgba(234,179,8,0.7)",
            marginBottom: "20px",
          }}>
            Platform Administration
          </p>
          <h1 style={{
            fontSize: "36px", fontWeight: 700, color: "white",
            lineHeight: 1.15, letterSpacing: "-0.8px", margin: "0 0 20px",
          }}>
            Full control<br />
            over the entire<br />
            <span style={{ color: "rgba(234,179,8,0.85)" }}>platform.</span>
          </h1>
          <p style={{
            color: "rgba(255,255,255,0.4)", fontSize: "14px",
            lineHeight: 1.75, maxWidth: "300px", margin: 0,
          }}>
            Manage users, teams, roles, payments, and every operation across the Averix Growth CRM.
          </p>

          {/* Stat row */}
          <div style={{
            display: "flex", gap: "32px", marginTop: "40px",
            paddingTop: "32px", borderTop: "1px solid rgba(255,255,255,0.08)",
          }}>
            {[
              { value: "Users", label: "Create & manage" },
              { value: "Roles", label: "Assign permissions" },
              { value: "Oversight", label: "Full platform view" },
            ].map(({ value, label }) => (
              <div key={label}>
                <p style={{ color: "white", fontWeight: 600, fontSize: "14px", margin: "0 0 3px" }}>{value}</p>
                <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "12px", margin: 0 }}>{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p style={{ color: "rgba(255,255,255,0.2)", fontSize: "11px", position: "relative" }}>
          © {new Date().getFullYear()} Averix Growth · Authorized personnel only
        </p>
      </div>

      {/* ── Right panel — form ─────────────────────────────────────── */}
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        padding: "48px 32px", background: "#f8f9fc",
      }}>
        <div style={{ width: "100%", maxWidth: "380px" }}>

          {/* Mobile logo */}
          <div className="lg:hidden" style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "36px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#1a1040", overflow: "hidden" }}>
              <img src="/favicon.png" alt="Averix" style={{ width: "100%", height: "100%", objectFit: "contain", padding: "5px" }} />
            </div>
            <p style={{ fontWeight: 700, fontSize: "15px", margin: 0 }}>Averix Growth</p>
          </div>

          {/* Heading */}
          <div style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "26px", fontWeight: 700, margin: "0 0 8px", letterSpacing: "-0.5px", color: "#0f172a" }}>
              Admin sign in
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "14px", margin: 0 }}>
              Restricted to authorized administrators
            </p>
          </div>

          {/* Form card */}
          <div style={{
            background: "white", borderRadius: "16px",
            border: "1px solid #e8eaf0",
            padding: "28px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)",
          }}>
            <form onSubmit={submit}>
              {/* Username / Email */}
              <div style={{ marginBottom: "18px" }}>
                <label style={{
                  display: "block", fontSize: "13px", fontWeight: 600,
                  color: "#374151", marginBottom: "7px",
                }}>
                  Username or Email
                </label>
                <input
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  placeholder="admin or admin@averixgrowth.com"
                  style={{
                    width: "100%", padding: "10px 14px", borderRadius: "9px",
                    border: "1.5px solid #e2e8f0", fontSize: "14px",
                    color: "#0f172a", background: "#fafafa",
                    boxSizing: "border-box", outline: "none", transition: "border-color 0.2s",
                  }}
                  onFocus={(e) => { e.target.style.borderColor = "#eab308"; e.target.style.background = "white"; }}
                  onBlur={(e) => { e.target.style.borderColor = "#e2e8f0"; e.target.style.background = "#fafafa"; }}
                />
              </div>

              {/* Password */}
              <div style={{ marginBottom: "20px" }}>
                <label style={{
                  display: "block", fontSize: "13px", fontWeight: 600,
                  color: "#374151", marginBottom: "7px",
                }}>
                  Password
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                    style={{
                      width: "100%", padding: "10px 42px 10px 14px", borderRadius: "9px",
                      border: "1.5px solid #e2e8f0", fontSize: "14px",
                      color: "#0f172a", background: "#fafafa",
                      boxSizing: "border-box", outline: "none", transition: "border-color 0.2s",
                    }}
                    onFocus={(e) => { e.target.style.borderColor = "#eab308"; e.target.style.background = "white"; }}
                    onBlur={(e) => { e.target.style.borderColor = "#e2e8f0"; e.target.style.background = "#fafafa"; }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    tabIndex={-1}
                    style={{
                      position: "absolute", right: "13px", top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 0,
                    }}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  marginBottom: "16px", padding: "10px 14px", borderRadius: "9px",
                  background: "#fef2f2", border: "1px solid #fecaca",
                  fontSize: "13px", color: "#dc2626",
                }}>
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={busy || !identifier || !password}
                style={{
                  width: "100%", padding: "11px", borderRadius: "9px",
                  background: busy || !identifier || !password
                    ? "#fef9c3"
                    : "linear-gradient(135deg, #1a1040, #374151)",
                  color: busy || !identifier || !password ? "#a16207" : "white",
                  fontWeight: 600, fontSize: "14px",
                  border: "none", cursor: busy || !identifier || !password ? "not-allowed" : "pointer",
                  letterSpacing: "0.1px",
                  boxShadow: busy || !identifier || !password ? "none" : "0 4px 12px rgba(26,16,64,0.25)",
                  transition: "all 0.2s",
                }}
              >
                {busy ? "Signing in…" : "Sign in to Admin"}
              </button>
            </form>
          </div>

          {/* Help note */}
          <p style={{
            textAlign: "center", color: "#94a3b8", fontSize: "12.5px",
            marginTop: "20px", lineHeight: 1.6,
          }}>
            Only accounts with the Admin role can access this portal.
          </p>
        </div>
      </div>
    </div>
  );
}
