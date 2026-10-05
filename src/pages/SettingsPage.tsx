import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { supabase } from "@/lib/supabase/client";
import { Shield, User, Save, KeyRound, Eye, EyeOff, CheckCircle } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();
  const [name, setName]     = useState(user?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const handleSave = async () => {
    if (!user || !name.trim()) return;
    setSaving(true); setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: err } = await (supabase.from("users") as any)
        .update({ full_name: name.trim(), updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (err) throw new Error(err.message);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);
    setChangingPassword(true);

    try {
      // Validation
      if (newPassword.length < 8) {
        throw new Error("New password must be at least 8 characters long");
      }

      if (newPassword !== confirmPassword) {
        throw new Error("New password and confirmation do not match");
      }

      if (currentPassword === newPassword) {
        throw new Error("New password must be different from current password");
      }

      // Update password in Supabase Auth
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) {
        console.error("❌ Admin password update error:", updateError);
        throw new Error(updateError.message || "Failed to update password");
      }

      // Password changed successfully
      console.log("✅ Admin password updated successfully in Supabase Auth");

      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      // Auto-hide success message after 5 seconds
      setTimeout(() => setPasswordSuccess(false), 5000);

    } catch (err) {
      console.error("❌ Admin password change error:", err);
      setPasswordError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-heading)]">Settings</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">Manage your admin profile and security</p>
      </div>

      {/* Change Password Card */}
      <div className="premium-card p-6">
        <h3 className="font-semibold text-[var(--color-text-heading)] mb-1 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-[var(--color-brand-blue)]" />
          Change Password
        </h3>
        <p className="text-sm text-[var(--color-text-secondary)] mb-6">Update your password to keep your account secure</p>

        <form onSubmit={handleChangePassword} className="space-y-4">
          {/* Password Requirements Info */}
          <div className="rounded-lg border-2 border-blue-200 bg-blue-50/50 p-4">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-blue-900 text-sm">Password Requirements</p>
                <ul className="mt-2 text-xs text-blue-800 space-y-1">
                  <li>• At least 8 characters long</li>
                  <li>• Must be different from your current password</li>
                  <li>• Should include a mix of letters, numbers, and symbols</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Current Password */}
          <div>
            <label htmlFor="current-password" className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">
              Current Password
            </label>
            <div className="relative">
              <input
                id="current-password"
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="field focus:field-focus pr-10 w-full"
                placeholder="Enter your current password"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-body)] transition-colors"
                tabIndex={-1}
              >
                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <label htmlFor="new-password" className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">
              New Password
            </label>
            <div className="relative">
              <input
                id="new-password"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
                className="field focus:field-focus pr-10 w-full"
                placeholder="Enter your new password"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-body)] transition-colors"
                tabIndex={-1}
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label htmlFor="confirm-password" className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                id="confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
                className="field focus:field-focus pr-10 w-full"
                placeholder="Confirm your new password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-body)] transition-colors"
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {passwordError && (
            <div className="rounded-lg border-2 border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-600 font-medium">{passwordError}</p>
            </div>
          )}

          {/* Success Message */}
          {passwordSuccess && (
            <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                <p className="text-sm text-emerald-600 font-medium">
                  Password changed successfully! You can now login with your new password.
                </p>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={changingPassword}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-semibold hover:bg-[var(--color-brand-blue-hover)] disabled:opacity-60 transition-all"
            >
              <KeyRound className="h-4 w-4" />
              {changingPassword ? "Changing Password..." : "Change Password"}
            </button>
          </div>
        </form>
      </div>

      {/* Profile card */}
      <div className="premium-card p-6">
        <h3 className="font-semibold text-[var(--color-text-heading)] mb-4 flex items-center gap-2">
          <User className="h-5 w-5 text-[var(--color-brand-blue)]" />
          Profile Information
        </h3>
        
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-[var(--color-border-default)]">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[var(--color-brand-gold)] to-amber-500 flex items-center justify-center text-[#081A33] font-bold text-lg">
            {user?.initials ?? "A"}
          </div>
          <div>
            <p className="font-semibold text-[var(--color-text-heading)]">{user?.name}</p>
            <p className="text-sm text-[var(--color-text-secondary)]">{user?.email}</p>
            <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-xs font-medium text-blue-700">
              <Shield className="h-3 w-3" />
              Administrator
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">
              Display Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="field focus:field-focus"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Email</label>
            <input type="email" value={user?.email ?? ""} disabled className="field opacity-60 cursor-not-allowed" />
            <p className="text-xs text-[var(--color-text-muted)] mt-1">Email cannot be changed here.</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-[var(--color-text-body)] mb-1.5">Username</label>
            <input type="text" value={user?.username ?? ""} disabled className="field opacity-60 cursor-not-allowed" />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          {saved && <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">✓ Profile saved successfully.</p>}

          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-brand-blue)] text-white text-sm font-semibold hover:bg-[var(--color-brand-blue-hover)] disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="premium-card p-6">
        <h3 className="font-semibold text-[var(--color-text-heading)] mb-3">Platform Info</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-secondary)]">Application</dt>
            <dd className="font-medium text-[var(--color-text-body)]">Averix Growth Admin</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-secondary)]">CRM Portal</dt>
            <dd className="font-medium text-[var(--color-text-body)]">localhost:8081</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-secondary)]">Database</dt>
            <dd className="font-medium text-[var(--color-text-body)]">Supabase (shared)</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
