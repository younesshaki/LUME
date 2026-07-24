import { useNavigate, useParams } from "react-router-dom";
import type { BlockComponentProps } from "../registry";
import { booleanProp, stringProp } from "./props";
import VehicleDetailContent from "@/experience/ui/VehicleDetailPage/VehicleDetailContent";
import "@/experience/ui/VehicleDetailPage/VehicleDetailPage.css";

/**
 * The page-builder vehicle-detail block: the same surface the hardcoded VDP
 * renders (via VehicleDetailContent), editable per page — eyebrow, optional
 * dealer overview section, and gallery/specs/actions toggles. The vehicle
 * comes from the current route (/vehicles/:vehicleId); in the admin preview
 * (no route vehicle) it shows a placeholder instead of loading anything.
 */
export function VehicleDetail({ block }: BlockComponentProps) {
  const navigate = useNavigate();
  const { vehicleId } = useParams();

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
      eyebrow={stringProp(block, "eyebrow", "Marketplace Concept")}
      overviewTitle={stringProp(block, "overviewTitle")}
      overviewText={stringProp(block, "overviewText")}
      showGallery={booleanProp(block, "showGallery", true)}
      showSpecs={booleanProp(block, "showSpecs", true)}
      showActions={booleanProp(block, "showActions", true)}
    />
  );
}
