import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "../app-shell/RequireAuth";
import { ROUTE_PATHS } from "../app-shell/routePaths";
import { AdminLogin } from "./AdminLogin";
import { AdminShell } from "./AdminShell";

const AdminPage = lazy(() => import("../experience/ui/AdminPage"));

type AdminRouterProps = {
  onExit: () => void;
};

export default function AdminRouter({ onExit }: AdminRouterProps) {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="login" element={<AdminLogin />} />
        <Route
          path="dashboard"
          element={
            <RequireAuth>
              <AdminShell>
                <AdminPage onExit={onExit} />
              </AdminShell>
            </RequireAuth>
          }
        />
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="*" element={<Navigate to={ROUTE_PATHS.adminDashboard} replace />} />
      </Routes>
    </Suspense>
  );
}

