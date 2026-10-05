import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
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
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left branding panel */}
      <div className="hidden lg:flex flex-col justify-between bg-[var(--color-sidebar-navy)] p-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-[var(--color-brand-gold)] flex items-center justify-center">
            <img src="/favicon.png" alt="Averix" className="w-full h-full object-contain p-1.5" />
          </div>
          <div>
            <p className="text-white font-bold text-lg tracking-tight">Averix Growth</p>
            <p className="text-[#94A3B8] text-xs">Admin Portal</p>
          </div>
        </div>

        <div>
          <div className="w-14 h-14 rounded-2xl bg-[var(--color-brand-gold)]/20 flex items-center justify-center mb-6">
            <ShieldCheck className="h-7 w-7 text-[var(--color-brand-gold)]" />
          </div>
          <h2 className="text-3xl font-bold text-white leading-tight">
            Admin Control Panel
          </h2>
          <p className="mt-3 text-[#94A3B8] text-sm leading-relaxed max-w-sm">
            Manage users, teams, roles, and permissions for the entire Averix Growth platform.
            Restricted to authorized administrators only.
          </p>
          <ul className="mt-8 space-y-3">
            {["Create & manage user accounts", "Assign roles and permissions", "View all teams and activity", "Full platform oversight"].map(f => (
              <li key={f} className="flex items-center gap-3 text-sm text-[#CBD5E1]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand-gold)] shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[#475569] text-xs">
          © {new Date().getFullYear()} Averix Growth. Authorized personnel only.
        </p>
      </div>

      {/* Right sign-in form */}
      <div className="flex items-center justify-center px-5 py-12 bg-[var(--color-bg-main)]">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-9 h-9 rounded-xl overflow-hidden bg-[var(--color-brand-gold)]">
              <img src="/favicon.png" alt="Averix" className="w-full h-full object-contain p-1" />
            </div>
            <p className="font-bold text-[var(--color-text-heading)]">Averix Admin</p>
          </div>

          <h1 className="text-2xl font-bold text-[var(--color-text-heading)] tracking-tight">
            Admin sign in
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            This portal is restricted to administrators.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="identifier" className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">
                Username or Email
              </label>
              <input
                id="identifier"
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                className="field focus:field-focus"
                placeholder="admin or admin@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="field focus:field-focus pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  tabIndex={-1}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-body)] transition-colors"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full btn-base btn-primary disabled:opacity-60 disabled:cursor-not-allowed h-10 font-semibold"
            >
              {busy ? "Signing in…" : "Sign in to Admin"}
            </button>
          </form>

          <div className="mt-6 rounded-xl border border-[var(--color-border-default)] bg-white p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-4 w-4 text-[var(--color-text-muted)] shrink-0 mt-0.5" />
              <p className="text-xs text-[var(--color-text-secondary)]">
                Only accounts with the <strong>Admin</strong> role can access this portal.
                Other roles are directed to the CRM portal.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
