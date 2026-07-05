"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  parseVehicleCsv,
  type VehicleImportResult,
} from "@/lib/vehicleImport";

type ImportClientProps = {
  tenantId: string;
  tenantSlug: string;
};

type ImportPhase =
  | { step: "pick" }
  | { step: "preview"; fileName: string; parsed: VehicleImportResult }
  | { step: "importing"; done: number; total: number }
  | { step: "done"; imported: number }
  | { step: "failed"; message: string; imported: number };

const BATCH_SIZE = 500;
const PREVIEW_ROWS = 8;

export default function ImportClient({ tenantId, tenantSlug }: ImportClientProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<ImportPhase>({ step: "pick" });

  const handleFile = async (file: File) => {
    const text = await file.text();
    setPhase({ step: "preview", fileName: file.name, parsed: parseVehicleCsv(text) });
  };

  const runImport = async (parsed: VehicleImportResult) => {
    const supabase = createSupabaseBrowserClient();
    const total = parsed.rows.length;
    let done = 0;
    setPhase({ step: "importing", done, total });

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = parsed.rows
        .slice(i, i + BATCH_SIZE)
        .map((row) => ({ ...row, tenant_id: tenantId }));
      const { error } = await supabase.from("vehicles").insert(batch);
      if (error) {
        setPhase({ step: "failed", message: error.message, imported: done });
        return;
      }
      done = Math.min(i + BATCH_SIZE, total);
      setPhase({ step: "importing", done, total });
    }

    setPhase({ step: "done", imported: total });
    router.refresh();
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold">Import vehicles from CSV</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Required columns: <code>year, make, model, price</code>. Optional:{" "}
          <code>
            trim, mileage, body_style, exterior_color, interior_color, drivetrain,
            fuel_type, image_src, seller_city, seller_state, stock_type, external_id
          </code>
          . Header names are case-insensitive; camelCase works too. Rows are{" "}
          <strong>added</strong> to the existing inventory.
        </p>
      </header>

      {phase.step === "pick" && (
        <label className="block rounded-lg border-2 border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center cursor-pointer hover:border-neutral-400 transition-colors">
          <span className="text-sm text-neutral-500">
            Choose a .csv file to preview it before anything is written
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </label>
      )}

      {phase.step === "preview" && (
        <PreviewPanel
          fileName={phase.fileName}
          parsed={phase.parsed}
          onBack={() => setPhase({ step: "pick" })}
          onImport={() => void runImport(phase.parsed)}
        />
      )}

      {phase.step === "importing" && (
        <p className="text-sm text-neutral-500" role="status">
          Importing… {phase.done}/{phase.total}
        </p>
      )}

      {phase.step === "done" && (
        <div className="space-y-3">
          <p className="text-sm text-green-600" role="status">
            Imported {phase.imported} vehicle{phase.imported === 1 ? "" : "s"}.
          </p>
          <Link
            href={`/admin/${tenantSlug}/vehicles`}
            className="inline-block rounded-lg bg-neutral-900 text-white px-4 py-2 text-sm font-medium hover:bg-neutral-700 transition-colors"
          >
            Back to inventory
          </Link>
        </div>
      )}

      {phase.step === "failed" && (
        <div className="space-y-3">
          <p className="text-sm text-red-600" role="alert">
            Import stopped after {phase.imported} rows: {phase.message}
          </p>
          <button
            type="button"
            className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            onClick={() => setPhase({ step: "pick" })}
          >
            Start over
          </button>
        </div>
      )}
    </div>
  );
}

function PreviewPanel({
  fileName,
  parsed,
  onBack,
  onImport,
}: {
  fileName: string;
  parsed: VehicleImportResult;
  onBack: () => void;
  onImport: () => void;
}) {
  const canImport = parsed.rows.length > 0;
  return (
    <div className="space-y-4">
      <p className="text-sm">
        <strong>{fileName}</strong>: {parsed.rows.length} valid row
        {parsed.rows.length === 1 ? "" : "s"}
        {parsed.errors.length > 0 && (
          <span className="text-amber-600">
            , {parsed.errors.length} problem{parsed.errors.length === 1 ? "" : "s"}
          </span>
        )}
      </p>

      {parsed.errors.length > 0 && (
        <ul className="text-xs text-amber-700 dark:text-amber-500 rounded-lg border border-amber-300 dark:border-amber-800 p-3 space-y-1 max-h-40 overflow-y-auto">
          {parsed.errors.slice(0, 50).map((error, i) => (
            <li key={i}>
              Line {error.line}: {error.message}
            </li>
          ))}
          {parsed.errors.length > 50 && <li>…and {parsed.errors.length - 50} more</li>}
        </ul>
      )}

      {canImport && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
                {["Year", "Make", "Model", "Trim", "Price", "Mileage", "Body"].map((h) => (
                  <th key={h} className="text-left px-3 py-2 font-medium text-neutral-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsed.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                <tr key={i} className="border-b border-neutral-100 dark:border-neutral-800/50">
                  <td className="px-3 py-2">{row.year}</td>
                  <td className="px-3 py-2">{row.make}</td>
                  <td className="px-3 py-2">{row.model}</td>
                  <td className="px-3 py-2">{row.trim}</td>
                  <td className="px-3 py-2">${row.price.toLocaleString()}</td>
                  <td className="px-3 py-2">{row.mileage ?? "—"}</td>
                  <td className="px-3 py-2">{row.body_style}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {parsed.rows.length > PREVIEW_ROWS && (
            <p className="px-3 py-2 text-xs text-neutral-500">
              …and {parsed.rows.length - PREVIEW_ROWS} more rows
            </p>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          disabled={!canImport}
          className="rounded-lg bg-neutral-900 text-white px-4 py-2 text-sm font-medium hover:bg-neutral-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={onImport}
        >
          Import {parsed.rows.length} vehicle{parsed.rows.length === 1 ? "" : "s"}
        </button>
        <button
          type="button"
          className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          onClick={onBack}
        >
          Choose another file
        </button>
      </div>
    </div>
  );
}
