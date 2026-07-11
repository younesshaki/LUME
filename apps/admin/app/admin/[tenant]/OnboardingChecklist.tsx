"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, Rocket, X } from "lucide-react";
import {
  ONBOARDING_DISMISSAL_VALUE,
  onboardingDismissalKey,
  onboardingProgress,
  shouldHideOnboardingChecklist,
  type OnboardingChecklistItem,
} from "@/lib/onboardingChecklist";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type OnboardingChecklistProps = {
  tenantId: string;
  items: OnboardingChecklistItem[];
};

export function OnboardingChecklist({ tenantId, items }: OnboardingChecklistProps) {
  const progress = onboardingProgress(items);
  const storageKey = onboardingDismissalKey(tenantId);
  const [hidden, setHidden] = React.useState(false);

  React.useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(storageKey);
      const shouldHide = shouldHideOnboardingChecklist(progress.allComplete, storedValue);
      setHidden(shouldHide);
      if (!progress.allComplete && storedValue !== null) {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      setHidden(false);
    }
  }, [progress.allComplete, storageKey]);

  const dismiss = () => {
    if (!progress.allComplete) return;
    try {
      window.localStorage.setItem(storageKey, ONBOARDING_DISMISSAL_VALUE);
    } catch {
      // A blocked storage API should not prevent dismissal for this page view.
    }
    setHidden(true);
  };

  if (hidden) return null;

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Rocket className="size-4 text-primary" aria-hidden="true" />
              Launch checklist
            </CardTitle>
            <CardDescription className="mt-1">
              {progress.completed} of {progress.total} setup steps are complete.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tabular-nums text-primary">
              {progress.percentage}%
            </span>
            {progress.allComplete ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Dismiss completed onboarding checklist"
                title="Dismiss checklist"
                onClick={dismiss}
              >
                <X aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </div>
        <Progress
          value={progress.percentage}
          aria-label={`${progress.percentage}% of onboarding complete`}
        />
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {item.complete ? (
              <CheckCircle2 className="size-4 text-emerald-500" aria-hidden="true" />
            ) : (
              <Circle className="size-4 text-muted-foreground" aria-hidden="true" />
            )}
            <span className={item.complete ? "text-muted-foreground line-through" : "font-medium"}>
              {item.label}
            </span>
            <ArrowRight className="ml-auto size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">{item.complete ? "Complete" : "Incomplete"}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
