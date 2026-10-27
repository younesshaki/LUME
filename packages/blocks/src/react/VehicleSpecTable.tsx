import type { BlockComponentProps } from "./types";
import { DealershipSection } from "./DealershipSection";
import { labelBodyItemsProp } from "./props";
export function VehicleSpecTable({ block }: BlockComponentProps) {
  const items = labelBodyItemsProp(block);

  return (
    <DealershipSection block={block} className="dealershipBlock--specs">
      <div className="vehicleSpecTable">
        <dl>
          {items.map((item, index) => (
            <div key={`${item.label}-${index}`}>
              <dt>{item.label}</dt>
              <dd>{item.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </DealershipSection>
  );
}
