import { useEffect, useState } from "react";
import type { VisitorLoyalty } from "@/lib/visitor/types";
import { visitorClient, type VisitorClient } from "@/lib/visitor/visitorClient";

type LoyaltyState =
  | { status: "loading" }
  | { status: "ready"; loyalty: VisitorLoyalty }
  | { status: "error"; message: string };

export function LoyaltyWidget({
  visitorId,
  client = visitorClient,
}: {
  visitorId: string;
  client?: VisitorClient;
}) {
  const [requestVersion, setRequestVersion] = useState(0);
  const [state, setState] = useState<LoyaltyState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });

    void client.getLoyalty(controller.signal).then(
      (loyalty) => {
        if (!controller.signal.aborted) setState({ status: "ready", loyalty });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Unable to load loyalty activity.",
          });
        }
      }
    );

    return () => controller.abort();
  }, [client, requestVersion, visitorId]);

  if (state.status === "loading") {
    return (
      <section className="visitorLoyalty visitorLoyalty--state" aria-live="polite">
        <p className="visitorAccount__eyebrow">Loyalty</p>
        <h2>Loading your balance…</h2>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="visitorLoyalty visitorLoyalty--state" aria-labelledby="loyalty-error-title">
        <p className="visitorAccount__eyebrow">Loyalty</p>
        <h2 id="loyalty-error-title">Balance unavailable</h2>
        <p className="visitorAccount__status visitorAccount__status--error" role="alert">
          {state.message}
        </p>
        <button
          type="button"
          className="visitorAccount__secondaryButton"
          onClick={() => setRequestVersion((version) => version + 1)}
        >
          Try again
        </button>
      </section>
    );
  }

  const { loyalty } = state;
  const progress = loyalty.tier
    ? calculateTierProgress(loyalty.points, loyalty.tier.threshold)
    : 0;
  const recentTransactions = loyalty.transactions.slice(0, 8);

  return (
    <section className="visitorLoyalty" aria-labelledby="loyalty-title">
      <div className="visitorLoyalty__heading">
        <div>
          <p className="visitorAccount__eyebrow">Loyalty</p>
          <h2 id="loyalty-title">Your standing</h2>
        </div>
        <div className="visitorLoyalty__balance" aria-label={`${loyalty.points} loyalty points`}>
          <strong>{loyalty.points.toLocaleString()}</strong>
          <span>Points</span>
        </div>
      </div>

      {loyalty.tier ? (
        <div className="visitorLoyalty__tier">
          <div className="visitorLoyalty__tierCopy">
            <span>Current tier</span>
            <strong>{loyalty.tier.name}</strong>
          </div>
          <div className="visitorLoyalty__progressCopy">
            <span>Progress to next tier</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <progress
            value={progress}
            max={100}
            aria-label={`Progress to next loyalty tier: ${Math.round(progress)} percent`}
          />
          <p>
            {loyalty.points.toLocaleString()} of {loyalty.tier.threshold.toLocaleString()} points
          </p>
        </div>
      ) : (
        <p className="visitorLoyalty__empty">Your first loyalty tier will appear here.</p>
      )}

      <div className="visitorLoyalty__transactions">
        <h3>Recent activity</h3>
        {recentTransactions.length === 0 ? (
          <p className="visitorLoyalty__empty">No loyalty transactions yet.</p>
        ) : (
          <ul>
            {recentTransactions.map((transaction) => (
              <li key={transaction.id}>
                <div>
                  <strong>{transaction.reason || "Loyalty adjustment"}</strong>
                  <time dateTime={transaction.createdAt}>{formatDate(transaction.createdAt)}</time>
                </div>
                <span className={transaction.delta >= 0 ? "visitorLoyalty__delta visitorLoyalty__delta--positive" : "visitorLoyalty__delta"}>
                  {transaction.delta > 0 ? "+" : ""}{transaction.delta.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function calculateTierProgress(points: number, threshold: number): number {
  if (!Number.isFinite(points) || !Number.isFinite(threshold) || threshold <= 0) return 0;
  return Math.min(100, Math.max(0, (points / threshold) * 100));
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
