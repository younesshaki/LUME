import { Suspense } from "react";
import type { Metadata } from "next";
import { Check } from "lucide-react";
import { PLAN_CATALOG, type PlanCatalogEntry } from "@lume/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LoginForm, LoginShell } from "./login-form";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "LUME plans — Basic, Pro, and Ultra. A cinematic storefront and an AI concierge for inventory-led businesses.",
};

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="/login" className="text-sm font-semibold tracking-[0.2em] text-primary">
            LUME
          </a>
          <nav aria-label="Page" className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <a href="#plans">Plans</a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="#sign-in">Sign in</a>
            </Button>
          </nav>
        </div>
      </header>

      <section aria-labelledby="hero-heading" className="relative overflow-hidden px-6 pb-20 pt-24 text-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 [background:radial-gradient(50rem_24rem_at_50%_-20%,color-mix(in_oklch,var(--primary)_16%,transparent),transparent_70%)]"
        />
        <div className="relative mx-auto max-w-3xl">
          <p className="text-sm font-semibold tracking-[0.2em] text-primary">
            LUME — AI SALES PLATFORM
          </p>
          <h1 id="hero-heading" className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            A cinematic storefront. A concierge that sells.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Give us your inventory. LUME gives you a premium site, an AI concierge,
            and a daily sales cockpit — built for dealers, live in days.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <a href="#plans">View plans</a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#sign-in">Sign in</a>
            </Button>
          </div>
        </div>
      </section>

      <section id="plans" aria-labelledby="plans-heading" className="scroll-mt-20 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h2 id="plans-heading" className="text-3xl font-semibold tracking-tight">
              Choose your plan
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              Every plan includes the cinematic storefront, inventory, CRM, and lead
              capture. The difference is what your concierge can do.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3 md:items-start">
            {PLAN_CATALOG.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        </div>
      </section>

      <section
        id="sign-in"
        aria-labelledby="signin-heading"
        className="scroll-mt-20 border-t bg-muted/40 px-6 py-20"
      >
        <div className="mx-auto flex max-w-md flex-col items-center text-center">
          <p className="text-sm font-semibold tracking-[0.2em] text-primary">
            EXISTING CUSTOMERS
          </p>
          <h2 id="signin-heading" className="mt-3 text-2xl font-semibold tracking-tight">
            Sign in to your cockpit
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Already running LUME? Pick up where you left off.
          </p>
          <div className="mt-8 grid w-full place-items-center text-left">
            <Suspense fallback={<LoginShell />}>
              <LoginForm />
            </Suspense>
          </div>
        </div>
      </section>

      <footer className="border-t px-6 py-8">
        <p className="text-center text-xs text-muted-foreground">
          LUME — plans and prices shown are early-access placeholders and may change
          before general availability.
        </p>
      </footer>
    </main>
  );
}

function PlanCard({ plan }: { plan: PlanCatalogEntry }) {
  return (
    <Card
      className={cn(
        "relative flex h-full flex-col",
        plan.highlighted && "border-primary/50 shadow-lg shadow-primary/5 ring-1 ring-primary/40",
      )}
    >
      {plan.badge && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
          {plan.badge}
        </span>
      )}
      <CardHeader>
        <CardTitle className="text-lg">{plan.name}</CardTitle>
        <CardDescription>{plan.tagline}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-6">
        <div>
          <p className="text-3xl font-semibold tracking-tight">{plan.price}</p>
          <p className="mt-1 text-sm text-muted-foreground">{plan.priceNote}</p>
        </div>
        <ul className="space-y-2.5">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5 text-sm">
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button
          asChild
          variant={plan.highlighted ? "default" : "outline"}
          className="w-full"
        >
          <a href={plan.ctaHref}>{plan.ctaLabel}</a>
        </Button>
      </CardFooter>
    </Card>
  );
}
