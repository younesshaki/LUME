"use client";

/**
 * Chart layer for the analytics page. Data arrives fully aggregated from the
 * server component (lib/analytics.ts) — this file only renders.
 *
 * All four charts encode one measure, so they share a single series color
 * (--chart-1, the validated gold step) and need no legends; identity lives in
 * the axis labels and tooltips.
 */
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { lookupMakeLogo, makeMonogram } from "@lume/types/vehicleMakeLogos";
import type { DayCount, NameCount, PriceBucket } from "@/lib/analytics";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const countConfig = {
  count: { label: "Count", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function LeadsOverTimeChart({ data }: { data: DayCount[] }) {
  const total = data.reduce((sum, day) => sum + day.count, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Leads over time</CardTitle>
        <CardDescription>
          {total.toLocaleString()} lead{total === 1 ? "" : "s"} in the last {data.length} days
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={{ count: { label: "Leads", color: "var(--chart-1)" } }}
          className="aspect-auto h-56 w-full"
        >
          <AreaChart data={data} margin={{ left: 4, right: 4, top: 4 }}>
            <defs>
              <linearGradient id="leadsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-count)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--color-count)" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
            />
            <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={28} />
            <ChartTooltip
              cursor={{ strokeWidth: 1 }}
              content={<ChartTooltipContent labelFormatter={(value) => String(value)} />}
            />
            <Area
              dataKey="count"
              type="monotone"
              stroke="var(--color-count)"
              strokeWidth={2}
              fill="url(#leadsFill)"
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

/**
 * Y-axis tick that draws the marque logo beside its name.
 *
 * Rendered as SVG rather than reusing the HTML <MakeLogo> component, because a
 * Recharts tick lives inside the chart's own <svg>. A nested <svg> with the
 * mark's own viewBox does the scaling and keeps proportions intact.
 *
 * Colour is `currentColor` throughout, so the logo, the monogram fallback and
 * the label all take the axis text colour — and therefore flip with the theme
 * together instead of one of them stranding on a dark background.
 */
function MakeAxisTick(props: { x?: number; y?: number; payload?: { value?: string } }) {
  const { x = 0, y = 0, payload } = props;
  const make = payload?.value ?? "";
  const logo = lookupMakeLogo(make);
  const SIZE = 16;

  return (
    <g transform={`translate(${x},${y})`} className="fill-muted-foreground text-muted-foreground">
      {logo ? (
        <svg
          x={-128}
          y={-SIZE / 2}
          width={SIZE}
          height={SIZE}
          viewBox={logo.viewBox}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          {logo.paths.map((d, index) => (
            <path key={index} d={d} fill="currentColor" fillRule={logo.fillRule} />
          ))}
        </svg>
      ) : (
        <text
          x={-128 + SIZE / 2}
          y={0}
          dy="0.32em"
          textAnchor="middle"
          fontSize={9}
          fontWeight={600}
          fill="currentColor"
          opacity={0.72}
          aria-hidden="true"
        >
          {makeMonogram(make)}
        </text>
      )}
      <text x={-104} y={0} dy="0.32em" textAnchor="start" fontSize={12} fill="currentColor">
        {make}
      </text>
    </g>
  );
}

function CategoryBarChart({
  title,
  description,
  data,
  emptyText,
  showMakeLogos = false,
}: {
  title: string;
  description: string;
  data: NameCount[];
  emptyText: string;
  /** Only the make chart gets marque logos; body styles have none. */
  showMakeLogos?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="flex h-56 items-center justify-center text-sm text-muted-foreground">
            {emptyText}
          </p>
        ) : (
          <ChartContainer
            config={countConfig}
            className="aspect-auto w-full"
            style={{ height: Math.max(160, data.length * 36) }}
          >
            <BarChart data={data} layout="vertical" margin={{ left: 4, right: 12 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" hide />
              <YAxis
                dataKey="name"
                type="category"
                tickLine={false}
                axisLine={false}
                width={showMakeLogos ? 132 : 96}
                {...(showMakeLogos ? { tick: <MakeAxisTick /> } : {})}
              />
              <ChartTooltip cursor={{ fillOpacity: 0.35 }} content={<ChartTooltipContent hideLabel />} />
              <Bar
                dataKey="count"
                name="Vehicles"
                fill="var(--color-count)"
                radius={[0, 4, 4, 0]}
                maxBarSize={20}
                isAnimationActive={false}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function InventoryByMakeChart({ data }: { data: NameCount[] }) {
  return (
    <CategoryBarChart
      title="Inventory by make"
      description="Current vehicles grouped by make"
      data={data}
      emptyText="No vehicles in inventory yet."
      showMakeLogos
    />
  );
}

export function InventoryByBodyStyleChart({ data }: { data: NameCount[] }) {
  return (
    <CategoryBarChart
      title="Inventory by body style"
      description="Current vehicles grouped by body style"
      data={data}
      emptyText="No vehicles in inventory yet."
    />
  );
}

export function PriceDistributionChart({ data }: { data: PriceBucket[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Price distribution</CardTitle>
        <CardDescription>Asking prices across the current inventory</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="flex h-56 items-center justify-center text-sm text-muted-foreground">
            No vehicles in inventory yet.
          </p>
        ) : (
          <ChartContainer config={countConfig} className="aspect-auto h-56 w-full">
            <BarChart data={data} margin={{ left: 4, right: 4, top: 4 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
              />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={28} />
              <ChartTooltip
                cursor={{ fillOpacity: 0.35 }}
                content={<ChartTooltipContent labelFormatter={(value) => String(value)} />}
              />
              <Bar
                dataKey="count"
                name="Vehicles"
                fill="var(--color-count)"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
                isAnimationActive={false}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
