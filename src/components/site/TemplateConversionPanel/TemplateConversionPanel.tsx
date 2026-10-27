import { TemplateConversionPanel as SharedPanel } from "@lume/blocks/react/TemplateConversionPanel";
import { LeadServicesProvider } from "@lume/blocks/react/LeadServices";
import { services } from "@/lib/pageBuilder/components/DealershipForms";
import { useTenantSiteDesign } from "@/lib/TenantThemeProvider";
import { useNavigation } from "@/app-shell/NavigationProvider";
import "./TemplateConversionPanel.css";
export function TemplateConversionPanel() {
  const design = useTenantSiteDesign();
  const { navigateTo } = useNavigation();
  return (
    <LeadServicesProvider value={services}>
      <SharedPanel design={design} navigateTo={navigateTo} />
    </LeadServicesProvider>
  );
}
