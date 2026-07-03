"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@lume/db";
import { useState } from "react";

const BODY_STYLES = ["SUV", "Sedan", "Coupe", "Truck", "Convertible", "Hatchback", "Wagon"];
const DRIVETRAINS = ["AWD", "4WD", "FWD", "RWD"];
const FUEL_TYPES = ["Gasoline", "Electric", "Hybrid", "Plug-In Hybrid", "Diesel"];
const STOCK_TYPES = ["New", "Used"];
const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

type FormState = {
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  mileage: number | null;
  body_style: string;
  exterior_color: string;
  interior_color: string;
  drivetrain: string;
  fuel_type: string;
  stock_type: string;
  seller_city: string;
  seller_state: string;
};

type VehicleInsert = Database["public"]["Tables"]["vehicles"]["Insert"];

const EMPTY: FormState = {
  year: new Date().getFullYear(),
  make: "", model: "", trim: "", price: 0, mileage: null,
  body_style: "SUV", exterior_color: "", interior_color: "",
  drivetrain: "AWD", fuel_type: "Gasoline", stock_type: "Used",
  seller_city: "", seller_state: "",
};

export default function VehicleForm({
  tenantId,
  tenantSlug,
  vehicleId,
  initial,
}: {
  tenantId: string;
  tenantSlug: string;
  vehicleId?: string;
  initial?: FormState;
}) {
  const router = useRouter();
  const [data, setData] = useState<FormState>(initial ?? EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNew = !vehicleId;

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setData((d) => ({ ...d, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Basic validation
    if (!data.make.trim()) { setError("Make is required"); return; }
    if (!data.model.trim()) { setError("Model is required"); return; }
    if (data.year < 1900 || data.year > 2030) { setError("Invalid year"); return; }
    if (data.price <= 0) { setError("Price must be greater than 0"); return; }

    setSaving(true);
    const supabase = createSupabaseBrowserClient();

    const payload = {
      tenant_id: tenantId,
      external_id: null,
      stock_type: data.stock_type,
      year: data.year,
      make: data.make,
      model: data.model,
      trim: data.trim,
      price: data.price,
      mileage: data.mileage ?? null,
      body_style: data.body_style,
      exterior_color: data.exterior_color,
      interior_color: data.interior_color,
      drivetrain: data.drivetrain,
      fuel_type: data.fuel_type,
      image_src: "",
      seller_city: data.seller_city,
      seller_state: data.seller_state,
      is_special: false,
      special_image_src: null,
    } satisfies VehicleInsert;

    if (isNew) {
      const { error } = await supabase.from("vehicles").insert(payload);
      if (error) { setError(error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase
        .from("vehicles")
        .update(payload)
        .eq("id", vehicleId)
        .eq("tenant_id", tenantId);
      if (error) { setError(error.message); setSaving(false); return; }
    }

    router.push(`/admin/${tenantSlug}/vehicles`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-8" noValidate>
      <header>
        <h1 className="text-2xl font-semibold">{isNew ? "Add Vehicle" : "Edit Vehicle"}</h1>
      </header>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400" role="alert">
          {error}
        </div>
      )}

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">Stock Info</h2>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-neutral-500">Year *</span>
            <input type="number" value={data.year} onChange={(e) => set("year", +e.target.value)}
              required min={1900} max={2030}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm bg-transparent" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-neutral-500">Stock Type</span>
            <select value={data.stock_type} onChange={(e) => set("stock_type", e.target.value)}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm bg-transparent">
              {STOCK_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-neutral-500">Make *</span>
            <input value={data.make} onChange={(e) => set("make", e.target.value)} required
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm bg-transparent" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-neutral-500">Model *</span>
            <input value={data.model} onChange={(e) => set("model", e.target.value)} required
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm bg-transparent" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-neutral-500">Trim</span>
            <input value={data.trim} onChange={(e) => set("trim", e.target.value)}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm bg-transparent" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-neutral-500">Price ($) *</span>
            <input type="number" value={data.price} onChange={(e) => set("price", +e.target.value)}
              required min={1}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm bg-transparent" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-neutral-500">Mileage</span>
            <input type="number" value={data.mileage ?? ""} onChange={(e) => set("mileage", e.target.value ? +e.target.value : null)}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm bg-transparent" />
          </label>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">Specifications</h2>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-neutral-500">Body Style</span>
            <select value={data.body_style} onChange={(e) => set("body_style", e.target.value)}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm bg-transparent">
              {BODY_STYLES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-neutral-500">Drivetrain</span>
            <select value={data.drivetrain} onChange={(e) => set("drivetrain", e.target.value)}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm bg-transparent">
              {DRIVETRAINS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-neutral-500">Fuel Type</span>
            <select value={data.fuel_type} onChange={(e) => set("fuel_type", e.target.value)}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm bg-transparent">
              {FUEL_TYPES.map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-neutral-500">Exterior Color</span>
            <input value={data.exterior_color} onChange={(e) => set("exterior_color", e.target.value)}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm bg-transparent" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-neutral-500">Interior Color</span>
            <input value={data.interior_color} onChange={(e) => set("interior_color", e.target.value)}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm bg-transparent" />
          </label>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">Location</h2>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-neutral-500">City</span>
            <input value={data.seller_city} onChange={(e) => set("seller_city", e.target.value)}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm bg-transparent" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-neutral-500">State</span>
            <select value={data.seller_state} onChange={(e) => set("seller_state", e.target.value)}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm bg-transparent">
              <option value="">—</option>
              {US_STATES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
        </div>
      </section>

      <div className="flex items-center gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
        <button type="submit" disabled={saving}
          className="rounded-lg bg-neutral-900 text-white px-6 py-2 text-sm font-medium hover:bg-neutral-700 disabled:opacity-50 transition-colors">
          {saving ? "Saving..." : isNew ? "Add Vehicle" : "Save Changes"}
        </button>
        <button type="button" onClick={() => router.back()}
          className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-6 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}
