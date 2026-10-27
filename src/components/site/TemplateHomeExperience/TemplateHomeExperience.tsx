import { useReducedMotion } from "motion/react";
import type { SiteTemplate } from "@lume/types";
import { TemplateHomeView } from "@lume/blocks/react/TemplateHome";
import CinematicShell from "@/experience/ui/CinematicShell";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { BlurFade } from "@/components/ui/blur-fade";
import { TemplateConversionPanel } from "@/components/site/TemplateConversionPanel";
import "./TemplateHomeExperience.css";
type Props = {
  template: SiteTemplate;
  onNavigateToProducts?: () => void;
  onNavigateToVehicles?: () => void;
  onNavigateToShowcase?: () => void;
  onNavigateToContact?: () => void;
};
export function TemplateHomeExperience(props: Props) {
  const reducedMotion = useReducedMotion();
  return (
    <TemplateHomeView
      {...props}
      Shell={CinematicShell}
      Reveal={BlurFade}
      reducedMotion={Boolean(reducedMotion)}
      Conversion={<TemplateConversionPanel />}
      onConversion={() =>
        document
          .querySelector(".templateConversion")
          ?.scrollIntoView({ behavior: "smooth", block: "center" })
      }
      Footer={
        <SiteFooter
          onNavigate={(screen) => {
            if (screen === "home")
              document
                .querySelector(".templateHome")
                ?.scrollTo({ top: 0, behavior: "smooth" });
            else if (screen === "products") props.onNavigateToProducts?.();
            else if (screen === "vehicles") props.onNavigateToVehicles?.();
            else if (screen === "showcase") props.onNavigateToShowcase?.();
            else if (screen === "contact") props.onNavigateToContact?.();
          }}
        />
      }
    />
  );
}
