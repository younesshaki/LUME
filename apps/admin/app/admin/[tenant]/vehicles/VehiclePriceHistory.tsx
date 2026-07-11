import {
  buildVehiclePriceSeries,
  countRecentPriceReductions,
  vehiclePriceSparklinePoints,
  type VehiclePriceChange,
} from "@/lib/priceHistory";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PriceSignalToggle } from "./PriceSignalToggle";

type PriceHistoryRow = VehiclePriceChange & { id: string };

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function VehiclePriceHistory({
  tenantSlug,
  currentPrice,
  history,
  signalEnabled,
  canManageSignal,
}: {
  tenantSlug: string;
  currentPrice: number;
  history: PriceHistoryRow[];
  signalEnabled: boolean;
  canManageSignal: boolean;
}) {
  const series = buildVehiclePriceSeries(history, currentPrice);
  const sparkline = vehiclePriceSparklinePoints(series);
  const recentReductions = countRecentPriceReductions(history);

  return (
    <Card className="max-w-4xl">
      <CardHeader>
        <CardTitle>Price history</CardTitle>
        <CardDescription>
          {history.length === 0
            ? "No price changes have been recorded for this vehicle."
            : `${history.length} recorded change${history.length === 1 ? "" : "s"}; ${recentReductions} reduction${recentReductions === 1 ? "" : "s"} in the last 30 days.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
          <div className="rounded-lg border bg-muted/20 p-3">
            <svg
              viewBox="0 0 480 96"
              preserveAspectRatio="none"
              className="h-24 w-full"
              role="img"
              aria-label={`Price trend ending at ${formatCurrency(currentPrice)}`}
            >
              {series.length > 1 ? (
                <polyline
                  points={sparkline}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                  className="text-primary"
                />
              ) : (
                <circle cx="240" cy="48" r="4" fill="currentColor" className="text-primary" />
              )}
            </svg>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Current price</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {formatCurrency(currentPrice)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {recentReductions} recent reduction{recentReductions === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <PriceSignalToggle
          tenantSlug={tenantSlug}
          initialEnabled={signalEnabled}
          canManage={canManageSignal}
        />

        {history.length > 0 ? (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Changed</TableHead>
                  <TableHead className="text-right">Previous</TableHead>
                  <TableHead className="text-right">New</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((change) => {
                  const difference = change.oldPrice === null
                    ? null
                    : change.newPrice - change.oldPrice;
                  return (
                    <TableRow key={change.id}>
                      <TableCell>
                        <time dateTime={change.changedAt}>{formatDate(change.changedAt)}</time>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {change.oldPrice === null ? "—" : formatCurrency(change.oldPrice)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatCurrency(change.newPrice)}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${
                        difference !== null && difference < 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : difference !== null && difference > 0
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground"
                      }`}>
                        {difference === null
                          ? "—"
                          : `${difference > 0 ? "+" : ""}${formatCurrency(difference)}`}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function formatCurrency(value: number): string {
  return CURRENCY_FORMATTER.format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : `${DATE_FORMATTER.format(date)} UTC`;
}
