import { Navigate, useLocation } from "react-router-dom";
import { ROUTE_PATHS } from "./routePaths";
import { useAuth } from "./AuthProvider";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div style={{ width: "100%", height: "100%", background: "#050509" }} />;
  }

  if (!user) {
    return (
      <Navigate
        to={ROUTE_PATHS.adminLogin}
        state={{ from: location.pathname + location.search }}
        replace
      />
    );
  }

  return <>{children}</>;
}

