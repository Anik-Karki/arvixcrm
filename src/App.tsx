import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth/auth-context";
import AdminShell from "@/components/AdminShell";

// Pages
import LoginPage        from "@/pages/LoginPage";
import DashboardPage    from "@/pages/DashboardPage";
import UsersPage        from "@/pages/UsersPage";
import TeamsPage        from "@/pages/TeamsPage";
import PartnersPage     from "@/pages/PartnersPage";
import PlayersPage      from "@/pages/PlayersPage";
import LeadsPage        from "@/pages/LeadsPage";
import DealsPage        from "@/pages/DealsPage";
import CampaignsPage    from "@/pages/CampaignsPage";
import PaymentRequestsPage from "@/pages/PaymentRequestsPage";
import PerformancePage  from "@/pages/PerformancePage";
import KPIsPage         from "@/pages/KPIsPage";
import ReportsPage      from "@/pages/ReportsPage";
import SecurityPage     from "@/pages/SecurityPage";
import TasksPage        from "@/pages/TasksPage";
import TrackingPage     from "@/pages/TrackingPage";
import RolesPage        from "@/pages/RolesPage";
import ActivityLogsPage from "@/pages/ActivityLogsPage";
import SettingsPage     from "@/pages/SettingsPage";

// ── Auth guard ────────────────────────────────────────────────────────────────

function ProtectedLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-main)]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[var(--color-brand-blue)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-[var(--color-text-secondary)]">Loading admin portal…</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return <AdminShell />;
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected — all admin routes */}
          <Route element={<ProtectedLayout />}>
            <Route path="/dashboard"     element={<DashboardPage />} />
            <Route path="/users"         element={<UsersPage />} />
            <Route path="/teams"         element={<TeamsPage />} />
            <Route path="/partners"      element={<PartnersPage />} />
            <Route path="/players"       element={<PlayersPage />} />
            <Route path="/leads"         element={<LeadsPage />} />
            <Route path="/deals"         element={<DealsPage />} />
            <Route path="/campaigns"     element={<CampaignsPage />} />
            <Route path="/payments"      element={<PaymentRequestsPage />} />
            <Route path="/performance"   element={<PerformancePage />} />
            <Route path="/kpis"          element={<KPIsPage />} />
            <Route path="/reports"       element={<ReportsPage />} />
            <Route path="/security"      element={<SecurityPage />} />
            <Route path="/tasks"         element={<TasksPage />} />
            <Route path="/tracking"      element={<TrackingPage />} />
            <Route path="/activity-logs" element={<ActivityLogsPage />} />
            <Route path="/roles"         element={<RolesPage />} />
            <Route path="/settings"      element={<SettingsPage />} />
          </Route>

          {/* Catch-all → dashboard */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
