import { CircleUserRound } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { ROUTE_PATHS } from "@/app-shell/routePaths";
import { useVisitorAuth } from "@/lib/visitor/VisitorAuthContext";
import "./VisitorAccountButton.css";

export function VisitorAccountButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const { status, visitor } = useVisitorAuth();
  const isAccountRoute = location.pathname === ROUTE_PATHS.account;
  const shortLabel = status === "authenticated" && visitor
    ? visitor.firstName || "Account"
    : status === "loading" ? "Account" : "Sign in";
  const accessibleLabel = status === "authenticated" && visitor
    ? `Open account for ${visitor.firstName || visitor.email}`
    : "Open visitor sign in and account";

  return (
    <button
      type="button"
      className={`visitorAccountButton${isAccountRoute ? " visitorAccountButton--active" : ""}`}
      aria-label={accessibleLabel}
      aria-current={isAccountRoute ? "page" : undefined}
      onClick={() => navigate(ROUTE_PATHS.account)}
    >
      <CircleUserRound size={17} strokeWidth={1.8} aria-hidden="true" />
      <span>{shortLabel}</span>
    </button>
  );
}
