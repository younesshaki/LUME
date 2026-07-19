import { ArrowDown, ArrowRight, CalendarDays, Gauge, Repeat2, WalletCards } from "lucide-react";
import { useReducedMotion } from "motion/react";
import type { SiteTemplate } from "@lume/types";
import CinematicShell from "@/experience/ui/CinematicShell";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { BlurFade } from "@/components/ui/blur-fade";
import { TemplateConversionPanel } from "@/components/site/TemplateConversionPanel";
import "./TemplateHomeExperience.css";

type TemplateHomeExperienceProps = {
  template: SiteTemplate;
  onNavigateToProducts?: () => void;
  onNavigateToVehicles?: () => void;
  onNavigateToShowcase?: () => void;
  onNavigateToContact?: () => void;
};

export function TemplateHomeExperience({
  template,
  onNavigateToProducts,
  onNavigateToVehicles,
  onNavigateToShowcase,
  onNavigateToContact,
}: TemplateHomeExperienceProps) {
  const reduceMotion = useReducedMotion();

  function scrollToConversion() {
    document
      .querySelector(".templateConversion")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <CinematicShell>
      <div
        className="templateHome"
        data-template={template.key}
        data-layout={template.visual.layout}
      >
        <div className="templateHome__background" aria-hidden="true" />
        <main id="top" className="templateHome__main">
          <section className="templateHome__hero">
            <BlurFade
              className="templateHome__heroCopy"
              duration={reduceMotion ? 0 : 0.58}
              offset={reduceMotion ? 0 : 12}
            >
              <p className="templateHome__eyebrow">{template.conversion.eyebrow}</p>
              <h1>{template.conversion.headline}</h1>
              <p className="templateHome__lead">{template.conversion.description}</p>
              <div className="templateHome__actions">
                <button type="button" onClick={onNavigateToVehicles}>
                  Explore inventory
                  <ArrowRight aria-hidden="true" />
                </button>
                <button type="button" onClick={scrollToConversion}>
                  {template.conversion.primaryLabel}
                  <ArrowDown aria-hidden="true" />
                </button>
              </div>
            </BlurFade>

            <BlurFade
              className="templateHome__motifWrap"
              delay={reduceMotion ? 0 : 0.12}
              duration={reduceMotion ? 0 : 0.65}
              offset={reduceMotion ? 0 : 12}
            >
              <TemplateMotif template={template} />
            </BlurFade>
          </section>

          <section className="templateHome__principles" aria-label={`${template.name} experience principles`}>
            <div className="templateHome__principlesIntro">
              <span>Built for the next step</span>
              <h2>{specialtyHeading(template)}</h2>
            </div>
            <ol>
              {template.conversion.trustPoints.map((point, index) => (
                <li key={point}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{point}</strong>
                  <p>{principleDescription(template, index)}</p>
                </li>
              ))}
            </ol>
          </section>

          <TemplateConversionPanel />
        </main>
        <SiteFooter
          onNavigate={(screen) => {
            if (screen === "home") {
              document.querySelector(".templateHome")?.scrollTo({ top: 0, behavior: "smooth" });
            } else if (screen === "products") onNavigateToProducts?.();
            else if (screen === "vehicles") onNavigateToVehicles?.();
            else if (screen === "showcase") onNavigateToShowcase?.();
            else if (screen === "contact") onNavigateToContact?.();
          }}
        />
      </div>
    </CinematicShell>
  );
}

function TemplateMotif({ template }: { template: SiteTemplate }) {
  if (template.specialty === "finance") {
    return (
      <div className="templateHome__motif templateHome__motif--finance" aria-label="Finance planning preview">
        <div className="templateHome__motifHeader"><WalletCards /> Purchase path</div>
        <div className="templateHome__metric">
          <span>Start with</span>
          <strong>Your budget</strong>
        </div>
        <div className="templateHome__meter"><span /></div>
        <div className="templateHome__motifFooter"><span>Inventory</span><span>Options</span><span>Dealer review</span></div>
      </div>
    );
  }
  if (template.specialty === "test-drive") {
    return (
      <div className="templateHome__motif templateHome__motif--drive" aria-label="Test-drive request preview">
        <span className="templateHome__driveNumber">01</span>
        <Gauge aria-hidden="true" />
        <p>See it.<br />Hear it.<br /><strong>Drive it.</strong></p>
        <span className="templateHome__driveStatus">Request lane open</span>
      </div>
    );
  }
  if (template.specialty === "appointment") {
    return (
      <div className="templateHome__motif templateHome__motif--appointment" aria-label="Appointment preview">
        <CalendarDays aria-hidden="true" />
        <p>Reserved for you</p>
        <strong>Personal dealership visit</strong>
        <div><span>Morning</span><span>Afternoon</span><span>Evening</span></div>
      </div>
    );
  }
  return (
    <div className="templateHome__motif templateHome__motif--exchange" aria-label="Trade-in journey preview">
      <div><span>Current</span><strong>Your vehicle</strong></div>
      <Repeat2 aria-hidden="true" />
      <div><span>Next</span><strong>New possibilities</strong></div>
    </div>
  );
}

function specialtyHeading(template: SiteTemplate): string {
  if (template.specialty === "finance") return "Clarity before commitment.";
  if (template.specialty === "test-drive") return "Momentum without pressure.";
  if (template.specialty === "appointment") return "A visit that feels prepared.";
  return "One connected change of vehicle.";
}

function principleDescription(template: SiteTemplate, index: number): string {
  const descriptions: Record<Exclude<SiteTemplate["specialty"], "luxury">, readonly string[]> = {
    finance: [
      "Guide shoppers toward a useful dealership conversation without inventing rates or approvals.",
      "Keep available vehicles close to the financial decision instead of separating the two.",
      "Make the human follow-up explicit, clear, and easy to request.",
    ],
    "test-drive": [
      "Reduce the distance between vehicle interest and a concrete drive request.",
      "Preserve which vehicle and timing matter when the shopper contacts the dealership.",
      "Let the dealership confirm every appointment rather than implying unavailable slots.",
    ],
    appointment: [
      "Set an expectation of individual attention before the customer arrives.",
      "Invite context so the dealership can prepare vehicles and answers in advance.",
      "Keep the experience calm, legible, and comfortable in both website modes.",
    ],
    "trade-in": [
      "Begin with honest vehicle details instead of a fictitious instant valuation.",
      "Connect a current vehicle to replacement inventory in one coherent journey.",
      "Route every request to a dealership-led appraisal and follow-up.",
    ],
  };
  const specialty = template.specialty === "luxury" ? "appointment" : template.specialty;
  return descriptions[specialty][index] ?? "";
}
