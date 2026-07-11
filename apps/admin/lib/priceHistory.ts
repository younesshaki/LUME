export type VehiclePriceChange = {
  oldPrice: number | null;
  newPrice: number;
  changedAt: string;
};

export type VehiclePricePoint = {
  price: number;
  changedAt: string;
};

export function buildVehiclePriceSeries(
  history: readonly VehiclePriceChange[],
  currentPrice: number,
): VehiclePricePoint[] {
  const chronological = [...history].sort(
    (a, b) => Date.parse(a.changedAt) - Date.parse(b.changedAt),
  );
  if (chronological.length === 0) {
    return [{ price: currentPrice, changedAt: new Date(0).toISOString() }];
  }

  const first = chronological[0];
  const points: VehiclePricePoint[] = [];
  if (first.oldPrice !== null) {
    points.push({ price: first.oldPrice, changedAt: first.changedAt });
  }
  for (const change of chronological) {
    points.push({ price: change.newPrice, changedAt: change.changedAt });
  }
  if (points[points.length - 1]?.price !== currentPrice) {
    points.push({
      price: currentPrice,
      changedAt: chronological[chronological.length - 1]?.changedAt ?? new Date(0).toISOString(),
    });
  }
  return points;
}

export function vehiclePriceSparklinePoints(
  series: readonly VehiclePricePoint[],
  width = 480,
  height = 96,
  padding = 8,
): string {
  if (series.length === 0) return "";
  const prices = series.map((point) => point.price);
  const minimum = Math.min(...prices);
  const maximum = Math.max(...prices);
  const range = Math.max(1, maximum - minimum);
  const xRange = Math.max(0, width - padding * 2);
  const yRange = Math.max(0, height - padding * 2);
  return series.map((point, index) => {
    const x = series.length === 1
      ? width / 2
      : padding + (index / (series.length - 1)) * xRange;
    const y = padding + ((maximum - point.price) / range) * yRange;
    return `${roundCoordinate(x)},${roundCoordinate(y)}`;
  }).join(" ");
}

export function countRecentPriceReductions(
  history: readonly VehiclePriceChange[],
  now: Date = new Date(),
  days = 30,
): number {
  const cutoff = now.getTime() - Math.max(1, days) * 24 * 60 * 60 * 1_000;
  return history.filter((change) => (
    change.oldPrice !== null &&
    change.newPrice < change.oldPrice &&
    Date.parse(change.changedAt) >= cutoff &&
    Date.parse(change.changedAt) <= now.getTime()
  )).length;
}

function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}
