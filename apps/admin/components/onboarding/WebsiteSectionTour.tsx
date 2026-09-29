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
import { dismissWebsiteSectionTour } from "../../app/admin/[tenant]/website/actions";
import {
  WEBSITE_SECTION_TOUR_OVERLAY_OPTIONS,
  WEBSITE_SECTION_TOURS,
  sectionTourCompactSelector,
  type WebsiteSectionTourKey,
} from "../../lib/websiteSectionTour";
import type { WebsiteTourStart } from "../../lib/websiteTour";

type WebsiteSectionTourProps = {
  tenantSlug: string;
  tourKey: WebsiteSectionTourKey;
  startMode: WebsiteTourStart;
  /** Only automatic demo-cohort runs show the persistent opt-out. */
  dismissible: boolean;
};

type TourContextValue = {
  label: string;
  dismissible: boolean;
  dismiss: () => void;
};

const TourContext = createContext<TourContextValue | null>(null);

function createTours(tourKey: WebsiteSectionTourKey): Tour[] {
  const definition = WEBSITE_SECTION_TOURS[tourKey];
  return [{
    tour: definition.name,
    steps: definition.steps.map(({ id: _id, ...step }) => ({
      ...step,
      cardOffset: 16,
      scrollOffset: 88,
      selectorRetryAttempts: 4,
      selectorRetryDelay: 100,
    })),
  }];
}

function fitTours(tourKey: WebsiteSectionTourKey): Tour[] {
  const definition = WEBSITE_SECTION_TOURS[tourKey];
  return [{
    tour: definition.name,
    steps: definition.steps.map(({ id, ...step }) => ({
      ...step,
      selector: sectionTourCompactSelector(step.selector, id, window.innerHeight),
      side: step.side,
      cardOffset: 16,
      scrollOffset: 88,
      selectorRetryAttempts: 4,
      selectorRetryDelay: 100,
    })),
  }];
}

/**
 * A route-local NextStep wrapper. It only ever spotlights existing controls;
 * it does not click, save, publish, select a template, or change a draft.
 */
export function WebsiteSectionTour({
  tenantSlug,
  tourKey,
  startMode,
  dismissible,
}: WebsiteSectionTourProps) {
  const [tours, setTours] = useState<Tour[]>(() => createTours(tourKey));
  const [dismissed, setDismissed] = useState(false);
  const definition = WEBSITE_SECTION_TOURS[tourKey];
  const dismiss = useCallback(() => {
    setDismissed(true);
    // Persistence is deliberately best-effort: an unavailable preference row
    // must never keep an informational overlay open or interrupt the route.
    void dismissWebsiteSectionTour(tenantSlug, tourKey).catch(() => undefined);
  }, [tenantSlug, tourKey]);

  return (
    <TourContext.Provider value={{ label: definition.label, dismissible: dismissible && !dismissed, dismiss }}>
      <NextStepProvider>
        <NextStep
          steps={tours}
          cardComponent={WebsiteSectionTourCard}
          shadowRgb="15, 23, 42"
          shadowOpacity="0.58"
          {...WEBSITE_SECTION_TOUR_OVERLAY_OPTIONS}
          disableConsoleLogs
        >
          <WebsiteSectionTourStarter
            tourKey={tourKey}
            startMode={startMode}
            onFitTours={setTours}
          />
          <DismissSectionTourBridge />
        </NextStep>
      </NextStepProvider>
    </TourContext.Provider>
  );
}

function WebsiteSectionTourStarter({
  tourKey,
  startMode,
  onFitTours,
}: {
  tourKey: WebsiteSectionTourKey;
  startMode: WebsiteTourStart;
  onFitTours: (tours: Tour[]) => void;
}) {
  const { startNextStep } = useNextStep();
  const attempted = useRef(false);
  const [startRequest, setStartRequest] = useState(0);
  const definition = WEBSITE_SECTION_TOURS[tourKey];

  useEffect(() => {
    if (startRequest > 0) startNextStep(definition.name);
  }, [definition.name, startNextStep, startRequest]);

  useEffect(() => {
    if (startMode === "none" || attempted.current) return;
    let observer: MutationObserver | null = null;
    let frame = 0;
    let started = false;

    const tryStart = () => {
      if (started || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (!definition.steps.every((tourStep) => document.querySelector(tourStep.selector))) return;
      started = true;
      observer?.disconnect();
      attempted.current = true;
      if (startMode === "manual") clearSectionReplayQuery(tourKey);
      onFitTours(fitTours(tourKey));
      setStartRequest((request) => request + 1);
    };

    frame = requestAnimationFrame(() => {
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
  }, [definition.steps, onFitTours, startMode, tourKey]);

  return null;
}

const DISMISS_SECTION_TOUR_EVENT = "lume:dismiss-website-section-tour";

function DismissSectionTourBridge() {
  const context = useContext(TourContext);
  const { closeNextStep } = useNextStep();
  useEffect(() => {
    const onDismiss = () => {
      closeNextStep();
      context?.dismiss();
    };
    window.addEventListener(DISMISS_SECTION_TOUR_EVENT, onDismiss);
    return () => window.removeEventListener(DISMISS_SECTION_TOUR_EVENT, onDismiss);
  }, [closeNextStep, context]);
  return null;
}

function WebsiteSectionTourCard({
  step,
  currentStep,
  totalSteps,
  nextStep,
  prevStep,
  skipTour,
}: CardComponentProps) {
  const context = useContext(TourContext);
  if (!context) return null;
  const lastStep = currentStep === totalSteps - 1;
  return (
    <section
      role="dialog"
      aria-label={context.label}
      aria-live="polite"
      className="w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xl"
    >
      <p className="text-xs font-medium text-muted-foreground">
        {context.label} · {currentStep + 1} of {totalSteps}
      </p>
      <h2 className="mt-2 text-base font-semibold">{step.title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.content}</p>
      <div className="mt-4 flex items-center justify-between gap-2">
        {skipTour && !lastStep ? (
          <Button type="button" variant="ghost" size="sm" onClick={skipTour}>Skip tutorial</Button>
        ) : <span />}
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={prevStep} disabled={currentStep === 0}>Back</Button>
          <Button type="button" size="sm" onClick={nextStep} autoFocus>{lastStep ? "Finish" : "Next"}</Button>
        </div>
      </div>
      {context.dismissible ? (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(DISMISS_SECTION_TOUR_EVENT))}
          className="mt-3 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Don&rsquo;t show again
        </button>
      ) : null}
    </section>
  );
}

function clearSectionReplayQuery(tourKey: WebsiteSectionTourKey): void {
  const url = new URL(window.location.href);
  if (url.searchParams.get("tour") !== tourKey) return;
  url.searchParams.delete("tour");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}
