import { LoyaltyWidget } from "@/components/visitor/LoyaltyWidget";
import { SavedVehiclesWidget } from "@/components/visitor/SavedVehiclesWidget";
import { VisitorAuthPanel } from "@/components/visitor/VisitorAuthPanel";
import { useVisitorAuth } from "@/lib/visitor/VisitorAuthContext";
import "@/components/visitor/visitor.css";

export default function AccountPage() {
  const { status, visitor, pendingAction, error, logout, clearError } = useVisitorAuth();

  return (
    <div className="visitorAccount">
      <main className="visitorAccount__main">
        <header className="visitorAccount__hero">
          <p className="visitorAccount__eyebrow">Visitor account</p>
          <h1>Your private LUME profile.</h1>
          <p>Manage your account details and see the loyalty history attached to your visit.</p>
        </header>

        {status === "loading" ? (
          <div className="visitorAccount__loading" role="status" aria-live="polite">
            Checking your account…
          </div>
        ) : null}

        {status === "anonymous" ? <VisitorAuthPanel /> : null}

        {status === "authenticated" && visitor ? (
          <div className="visitorAccount__dashboard">
            <section className="visitorAccount__profile" aria-labelledby="visitor-profile-title">
              <div className="visitorAccount__profileHeader">
                <div>
                  <p className="visitorAccount__eyebrow">Profile</p>
                  <h2 id="visitor-profile-title">{displayName(visitor)}</h2>
                  <p>Your signed-in details are shown exactly as LUME has them.</p>
                </div>
                <button
                  type="button"
                  className="visitorAccount__secondaryButton"
                  disabled={pendingAction === "logout"}
                  onClick={() => {
                    clearError();
                    void logout().catch(() => undefined);
                  }}
                >
                  {pendingAction === "logout" ? "Signing out…" : "Sign out"}
                </button>
              </div>

              <dl className="visitorAccount__details">
                <div>
                  <dt>Email</dt>
                  <dd>{visitor.email}</dd>
                </div>
                <div>
                  <dt>First name</dt>
                  <dd>{visitor.firstName || "Not provided"}</dd>
                </div>
                <div>
                  <dt>Last name</dt>
                  <dd>{visitor.lastName || "Not provided"}</dd>
                </div>
                <div>
                  <dt>Member since</dt>
                  <dd>{formatMemberSince(visitor.createdAt)}</dd>
                </div>
              </dl>

              {error ? (
                <p className="visitorAccount__status visitorAccount__status--error" role="alert">
                  {error}
                </p>
              ) : null}
            </section>

            <LoyaltyWidget visitorId={visitor.id} />
            <SavedVehiclesWidget />
          </div>
        ) : null}
      </main>
    </div>
  );
}

function displayName(visitor: { firstName: string; lastName: string; email: string }): string {
  return [visitor.firstName, visitor.lastName].filter(Boolean).join(" ") || visitor.email;
}

function formatMemberSince(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
}
