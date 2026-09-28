import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DEFAULT_FILTERS, loadVehicleResults } from "@/experience/vehicles/catalog";
import type { BlockComponentProps } from "../registry";
import { usePageBuilderRenderContext } from "../renderContext";
import { booleanProp, stringProp } from "./props";
import VehicleDetailContent from "@/experience/ui/VehicleDetailPage/VehicleDetailContent";
import "@/experience/ui/VehicleDetailPage/VehicleDetailPage.css";

/**
 * The page-builder vehicle-detail block: the same surface the hardcoded VDP
 * renders (via VehicleDetailContent), editable per page — eyebrow, optional
 * dealer overview section, and gallery/specs/actions toggles. The vehicle
 * comes from the current route (/vehicles/:vehicleId). The admin preview has no
 * route vehicle, so it renders one of the tenant's own vehicles as a sample —
 * otherwise every edit to this block was invisible behind a placeholder.
 */
export function VehicleDetail({ block }: BlockComponentProps) {
  const navigate = useNavigate();
  const { vehicleId: routeVehicleId } = useParams();
  const { preview } = usePageBuilderRenderContext();
  const sampleVehicleId = usePreviewSampleVehicleId(Boolean(preview && !routeVehicleId));
  const vehicleId = routeVehicleId ?? sampleVehicleId;

  if (!vehicleId) {
    return (
      <div className="vehicleDetail__state">
        <p>The vehicle detail surface renders here once a visitor opens a vehicle.</p>
      </div>
    );
  }

  return (
    <VehicleDetailContent
      vehicleId={vehicleId}
      onBackToVehicles={() => navigate("/vehicles")}
      // Unset → the house/tenant default inside VehicleDetailContent.
      eyebrow={stringProp(block, "eyebrow") || undefined}
      overviewTitle={stringProp(block, "overviewTitle")}
      overviewText={stringProp(block, "overviewText")}
      showGallery={booleanProp(block, "showGallery", true)}
      showSpecs={booleanProp(block, "showSpecs", true)}
      showActions={booleanProp(block, "showActions", true)}
    />
  );
}

/** The tenant's first listed vehicle, for the editor preview only. */
function usePreviewSampleVehicleId(enabled: boolean): string | undefined {
  const [id, setId] = useState<string>();
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadVehicleResults(DEFAULT_FILTERS, "recommended", 1, 1)
      .then((results) => {
        if (!cancelled) setId(results.vehicles[0]?.id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return enabled ? id : undefined;
}
