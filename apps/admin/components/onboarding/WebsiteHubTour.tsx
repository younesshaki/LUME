"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  NextStep,
  NextStepProvider,
  useNextStep,
  type CardComponentProps,
  type Tour,
} from "nextstepjs";
import { Button } from "../ui/button";
import { recordWebsiteTourOutcome } from "../../app/admin/[tenant]/website/actions";
import {
  WEBSITE_HUB_TOUR_STEPS,
  compactTourSelector,
  visibleTourSelector,
  WEBSITE_HUB_TOUR_OVERLAY_OPTIONS,
  WEBSITE_TOUR_NAME,
  WEBSITE_TOUR_START_EVENT,
  WEBSITE_TOUR_TARGETS,
  type WebsiteTourOutcome,
  type WebsiteTourStart,
} from "../../lib/websiteTour";

type WebsiteHubTourProps = {
  tenantSlug: string;
  startMode: WebsiteTourStart;
  /** Offer "Don't show again" (the tour opens by itself for this member). */
  dismissible?: boolean;
};

const TourDismissibleContext = createContext(false);

/**
 * The tour definition. `selectorFor` lets a start-time pass swap a target that
 * is too tall for the screen for a compact anchor inside it, so the card is
 * never scrolled out of view (see compactTourSelector).
 */
type StepDefinition = (typeof WEBSITE_HUB_TOUR_STEPS)[number];

function buildTours(
  placementFor: (step: StepDefinition) => { selector: string; side: StepDefinition["side"] } = (step) => step,
): Tour[] {
  return [{
    tour: WEBSITE_TOUR_NAME,
    steps: WEBSITE_HUB_TOUR_STEPS.map((definition) => {
      const { id: _id, fallbackSelectors: _fallbacks, ...step } = definition;
      const placement = placementFor(definition);
      return {
        ...step,
        selector: placement.selector,
        side: placement.side,
        cardOffset: 16,
        scrollOffset: 88,
        selectorRetryAttempts: 4,
        selectorRetryDelay: 100,
      };
    }),
  }];
}

function fitToViewport(): Tour[] {
  return buildTours((step) => {
    const visible = visibleTourSelector(step);
    return {
      selector: compactTourSelector(visible, step.id, window.innerHeight),
      side: visible === step.selector ? step.side : "bottom",
    };
  });
}

/**
 * Client-only NextStep wrapper for the route-local Website Hub tour. It owns no
 * dealer data: finish and skip only write a terminal member preference via the
 * authenticated server action.
 */
export function WebsiteHubTour({ tenantSlug, startMode, dismissible = false }: WebsiteHubTourProps) {
  const [tours, setTours] = useState<Tour[]>(() => buildTours());
  // Hidden for the rest of the visit once used, even before the page reloads.
  const [dismissed, setDismissed] = useState(false);
  const markDismissed = useCallback(() => setDismissed(true), []);
  return (
    <TourDismissibleContext.Provider value={dismissible && !dismissed}>
    <NextStepProvider>
      <NextStep
        steps={tours}
        cardComponent={WebsiteHubTourCard}
        shadowRgb="15, 23, 42"
        shadowOpacity="0.58"
        {...WEBSITE_HUB_TOUR_OVERLAY_OPTIONS}
        disableConsoleLogs
        onComplete={(tourName) => {
          if (tourName === WEBSITE_TOUR_NAME) void saveOutcome(tenantSlug, "completed");
        }}
        onSkip={(_step, tourName) => {
          if (tourName === WEBSITE_TOUR_NAME) void saveOutcome(tenantSlug, "skipped");
        }}
      >
        <WebsiteHubTourStarter startMode={startMode} onFitSteps={setTours} />
        <DismissTourBridge tenantSlug={tenantSlug} onDismissed={markDismissed} />
      </NextStep>
    </NextStepProvider>
    </TourDismissibleContext.Provider>
  );
}

function WebsiteHubTourStarter({
  startMode,
  onFitSteps,
}: {
  startMode: WebsiteTourStart;
  onFitSteps: (tours: Tour[]) => void;
}) {
  const { startNextStep } = useNextStep();
  const attempted = useRef(false);
  // Bumped once the steps are fitted to this screen; the tour starts on the
  // next render, after NextStep has received the fitted steps.
  const [startRequest, setStartRequest] = useState(0);

  useEffect(() => {
    if (startRequest > 0) startNextStep(WEBSITE_TOUR_NAME);
  }, [startRequest, startNextStep]);

  // Waits for every step's target to be on the page (and no modal open), then
  // starts the tour. Returns a cancel function.
  const startWhenReady = useCallback((clearQuery: boolean, onStarted?: () => void) => {
    let observer: MutationObserver | null = null;
    let started = false;

    const tryStart = () => {
      if (started || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const everyTargetExists = Object.values(WEBSITE_TOUR_TARGETS).every((selector) =>
        document.querySelector(selector),
      );
      if (!everyTargetExists) return;

      started = true;
      onStarted?.();
      observer?.disconnect();
      if (clearQuery) clearReplayQuery();
      onFitSteps(fitToViewport());
      setStartRequest((request) => request + 1);
    };

    const frame = requestAnimationFrame(() => {
      tryStart();
      if (!started) {
        observer = new MutationObserver(tryStart);
        observer.observe(document.body, { childList: true, subtree: true });
      }
    });

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [onFitSteps]);

  // Marked only once the tour really starts: a cancelled attempt (React's
  // development double-run, or leaving the page) must not block the next one.
  useEffect(() => {
    if (startMode === "none" || attempted.current) return;
    return startWhenReady(startMode === "manual", () => {
      attempted.current = true;
    });
  }, [startMode, startWhenReady]);

  // The Tutorial buttons restart the tour in place, any number of times.
  useEffect(() => {
    let cancel: (() => void) | null = null;
    const onStart = () => {
      cancel?.();
      cancel = startWhenReady(false);
    };
    window.addEventListener(WEBSITE_TOUR_START_EVENT, onStart);
    return () => {
      window.removeEventListener(WEBSITE_TOUR_START_EVENT, onStart);
      cancel?.();
    };
  }, [startWhenReady]);

  return null;
}

function WebsiteHubTourCard({
  step,
  currentStep,
  totalSteps,
  nextStep,
  prevStep,
  skipTour,
}: CardComponentProps) {
  const lastStep = currentStep === totalSteps - 1;
  const dismissible = useContext(TourDismissibleContext);
  return (
    <section
      role="dialog"
      aria-label="Website tour"
      aria-live="polite"
      className="w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xl"
    >
      <p className="text-xs font-medium text-muted-foreground">
        Website tour · {currentStep + 1} of {totalSteps}
      </p>
      <h2 className="mt-2 text-base font-semibold">{step.title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.content}</p>
      <div className="mt-4 flex items-center justify-between gap-2">
        {skipTour && !lastStep ? (
          <Button type="button" variant="ghost" size="sm" onClick={skipTour}>
            Skip tour
          </Button>
        ) : <span />}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={prevStep}
            disabled={currentStep === 0}
          >
            Back
          </Button>
          <Button type="button" size="sm" onClick={nextStep} autoFocus>
            {lastStep ? "Finish" : "Next"}
          </Button>
        </div>
      </div>
      {dismissible ? (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(WEBSITE_TOUR_DISMISS_EVENT))}
          className="mt-3 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Don&rsquo;t show again
        </button>
      ) : null}
    </section>
  );
}

// The card is rendered by NextStep outside this component's props, so it asks
// the bridge (which knows the tenant) to save the opt-out and close the tour.
const WEBSITE_TOUR_DISMISS_EVENT = "lume:dismiss-website-tour";

function DismissTourBridge({ tenantSlug, onDismissed }: { tenantSlug: string; onDismissed: () => void }) {
  const { closeNextStep } = useNextStep();
  useEffect(() => {
    const onDismiss = () => {
      // Close directly (not skipTour): a skip would save a second outcome that
      // could race this one.
      closeNextStep();
      onDismissed();
      void saveOutcome(tenantSlug, "dismissed");
    };
    window.addEventListener(WEBSITE_TOUR_DISMISS_EVENT, onDismiss);
    return () => window.removeEventListener(WEBSITE_TOUR_DISMISS_EVENT, onDismiss);
  }, [closeNextStep, onDismissed, tenantSlug]);
  return null;
}

async function saveOutcome(tenantSlug: string, outcome: WebsiteTourOutcome): Promise<void> {
  try {
    const result = await recordWebsiteTourOutcome(tenantSlug, outcome);
    if (result.error) throw new Error(result.error);
  } catch {
    // Tour persistence must never trap a member in the overlay or break Website Hub.
  }
}

function clearReplayQuery(): void {
  const url = new URL(window.location.href);
  if (url.searchParams.get("tour") !== "website") return;
  url.searchParams.delete("tour");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}
