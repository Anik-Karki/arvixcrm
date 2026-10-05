import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../supabase/client";
import type { AdminUser } from "./types";

// ── mapper ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: Record<string, any>): AdminUser {
  const fullName: string = row["full_name"] ?? row["name"] ?? "Admin";
  const parts = fullName.split(" ").filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((n: string) => n[0]?.toUpperCase() ?? "")
    .join("") || "A";
  return {
    id:       row["id"],
    name:     fullName,
    email:    row["email"],
    username: row["username"] ?? row["email"],
    role:     row["role"],
    teamId:   row["team_id"] ?? null,
    initials,
  };
}

// ── context ───────────────────────────────────────────────────────────────────

interface AuthState {
  user: AdminUser | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<AdminUser>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  // ── resolve email from username or direct email ─────────────────────────

  async function resolveEmail(identifier: string): Promise<string> {
    const trimmed = identifier.trim().toLowerCase();
    if (trimmed.includes("@")) return trimmed;

    // Call SQL function — grants anon access
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)("get_user_by_username", {
      p_username: trimmed,
    });
    if (error || !data || (data as any[]).length === 0) {
      throw new Error("Invalid username or password.");
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = (data as any[])[0];
    if (row.user_status === "inactive" || row.user_status === "suspended") {
      throw new Error("Your account is not active.");
    }
    return row.user_email as string;
  }

  // ── load user from session ───────────────────────────────────────────────

  async function loadUserFromSession(): Promise<AdminUser | null> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row } = await (supabase.from("users") as any)
      .select("*")
      .eq("id", session.user.id)
      .single() as { data: Record<string, any> | null; error: any };

    if (!row || row["role"] !== "admin") {
      await supabase.auth.signOut();
      return null;
    }
    return mapRow(row);
  }

  // ── initial load ─────────────────────────────────────────────────────────

  useEffect(() => {
    let active = true;
    loadUserFromSession().then((u) => {
      if (!active) return;
      setUser(u);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_, session) => {
      if (!active) return;
      if (!session?.user) { setUser(null); setLoading(false); return; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: row } = await (supabase.from("users") as any)
        .select("*")
        .eq("id", session.user.id)
        .single() as { data: Record<string, any> | null; error: any };

      if (row && row["role"] === "admin") {
        setUser(mapRow(row));
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  // ── signIn ────────────────────────────────────────────────────────────────

  const signIn = useCallback(async (identifier: string, password: string): Promise<AdminUser> => {
    setLoading(true);
    try {
      const email = await resolveEmail(identifier);

      const { data: authData, error: authErr } =
        await supabase.auth.signInWithPassword({ email, password });

      if (authErr || !authData.user) {
        throw new Error("Invalid username or password.");
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: row } = await (supabase.from("users") as any)
        .select("*")
        .eq("id", authData.user.id)
        .single() as { data: Record<string, any> | null; error: any };

      if (!row) {
        await supabase.auth.signOut();
        throw new Error("User profile not found.");
      }

      // ✅ ADMIN ONLY — non-admins are rejected here
      if (row["role"] !== "admin") {
        await supabase.auth.signOut();
        throw new Error("Access denied. This portal is for administrators only.");
      }

      if (row["status"] === "inactive" || row["status"] === "suspended") {
        await supabase.auth.signOut();
        throw new Error("Your account is inactive. Contact support.");
      }

      // Update last login (non-blocking)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("users") as any)
        .update({ last_login: new Date().toISOString() })
        .eq("id", row["id"])
        .then(() => {});

      const admin = mapRow(row);
      setUser(admin);
      // ── Audit log: admin login ──────────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("activity_logs") as any).insert({
        user_id:     admin.id,
        user_email:  admin.email,
        user_role:   "admin",
        action:      "user_login",
        entity_type: "user",
        entity_id:   admin.id,
        entity_name: admin.name,
        new_value:   { username: admin.username, role: "admin" },
      }).then(() => {});
      return admin;
    } finally {
      setLoading(false);
    }
  }, []);

  // ── signOut ───────────────────────────────────────────────────────────────

  const signOut = useCallback(async () => {
    // ── Audit log: admin logout (capture before clearing) ───────────────────
    if (user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("activity_logs") as any).insert({
        user_id:     user.id,
        user_email:  user.email,
        user_role:   "admin",
        action:      "user_logout",
        entity_type: "user",
        entity_id:   user.id,
        entity_name: user.name,
      }).then(() => {});
    }
    await supabase.auth.signOut();
    setUser(null);
  }, [user]);

  const value = useMemo<AuthState>(
    () => ({ user, loading, signIn, signOut }),
    [user, loading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
