"use client";

import { useEffect, useRef } from "react";
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
  WEBSITE_HUB_TOUR_OVERLAY_OPTIONS,
  WEBSITE_TOUR_NAME,
  WEBSITE_TOUR_TARGETS,
  type WebsiteTourStart,
} from "../../lib/websiteTour";

type WebsiteHubTourProps = {
  tenantSlug: string;
  startMode: WebsiteTourStart;
};

const tours: Tour[] = [{
  tour: WEBSITE_TOUR_NAME,
  steps: WEBSITE_HUB_TOUR_STEPS.map(({ id: _id, ...step }) => ({
    ...step,
    cardOffset: 16,
    scrollOffset: 88,
    selectorRetryAttempts: 4,
    selectorRetryDelay: 100,
  })),
}];

/**
 * Client-only NextStep wrapper for the route-local Website Hub tour. It owns no
 * dealer data: finish and skip only write a terminal member preference via the
 * authenticated server action.
 */
export function WebsiteHubTour({ tenantSlug, startMode }: WebsiteHubTourProps) {
  return (
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
        <WebsiteHubTourStarter startMode={startMode} />
      </NextStep>
    </NextStepProvider>
  );
}

function WebsiteHubTourStarter({ startMode }: { startMode: WebsiteTourStart }) {
  const { startNextStep } = useNextStep();
  const attempted = useRef(false);

  useEffect(() => {
    if (startMode === "none" || attempted.current) return;
    attempted.current = true;

    let observer: MutationObserver | null = null;
    let frame = 0;
    let started = false;

    const startWhenReady = () => {
      if (started || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const everyTargetExists = Object.values(WEBSITE_TOUR_TARGETS).every((selector) =>
        document.querySelector(selector),
      );
      if (!everyTargetExists) return;

      started = true;
      observer?.disconnect();
      if (startMode === "manual") clearReplayQuery();
      startNextStep(WEBSITE_TOUR_NAME);
    };

    frame = requestAnimationFrame(() => {
      startWhenReady();
      if (!started) {
        observer = new MutationObserver(startWhenReady);
        observer.observe(document.body, { childList: true, subtree: true });
      }
    });

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [startMode, startNextStep]);

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
    </section>
  );
}

async function saveOutcome(tenantSlug: string, outcome: "completed" | "skipped"): Promise<void> {
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
