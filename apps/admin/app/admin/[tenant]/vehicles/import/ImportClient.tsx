"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  findDuplicates,
  parseVehicleCsv,
  type DuplicateReason,
  type VehicleFingerprint,
  type VehicleImportResult,
} from "@/lib/vehicleImport";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type ImportClientProps = {
  tenantId: string;
  tenantSlug: string;
};

type ImportMode = "add" | "replace";

type ImportPhase =
  | { step: "pick" }
  | { step: "checking"; fileName: string }
  | {
      step: "preview";
      fileName: string;
      parsed: VehicleImportResult;
      duplicates: Map<number, DuplicateReason>;
      existingCount: number;
    }
  | { step: "importing"; done: number; total: number }
  | { step: "done"; imported: number; deleted: number }
  | { step: "failed"; message: string; imported: number };

const BATCH_SIZE = 500;
const PREVIEW_ROWS = 8;
const FINGERPRINT_PAGE = 1000;

export default function ImportClient({ tenantId, tenantSlug }: ImportClientProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<ImportPhase>({ step: "pick" });
  const [mode, setMode] = useState<ImportMode>("add");
  // Row indices (into parsed.rows) the user chose to skip; duplicates start skipped.
  const [skipped, setSkipped] = useState<Set<number>>(new Set());

  const handleFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseVehicleCsv(text);
    setPhase({ step: "checking", fileName: file.name });
    try {
      const existing = await fetchExistingFingerprints(tenantId);
      const duplicates = findDuplicates(parsed.rows, existing);
      setMode("add");
      setSkipped(new Set(duplicates.keys()));
      setPhase({
        step: "preview",
        fileName: file.name,
        parsed,
        duplicates,
        existingCount: existing.length,
      });
    } catch (error) {
      setPhase({
        step: "failed",
        message: error instanceof Error ? error.message : "Could not read current inventory",
        imported: 0,
      });
    }
  };

  const runImport = async (
    parsed: VehicleImportResult,
    importMode: ImportMode,
    existingCount: number
  ) => {
    const supabase = createSupabaseBrowserClient();
    const rows =
      importMode === "replace"
        ? parsed.rows
        : parsed.rows.filter((_, index) => !skipped.has(index));
    const total = rows.length;
    let done = 0;
    setPhase({ step: "importing", done, total });

    let deleted = 0;
    if (importMode === "replace") {
      // Order matters: wipe first so a mid-import failure never leaves the
      // old and new inventories mixed together.
      const { error } = await supabase.from("vehicles").delete().eq("tenant_id", tenantId);
      if (error) {
        setPhase({ step: "failed", message: `Could not clear inventory: ${error.message}`, imported: 0 });
        return;
      }
      deleted = existingCount;
    }

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE).map((row) => ({ ...row, tenant_id: tenantId }));
      const { error } = await supabase.from("vehicles").insert(batch);
      if (error) {
        setPhase({ step: "failed", message: error.message, imported: done });
        return;
      }
      done = Math.min(i + BATCH_SIZE, total);
      setPhase({ step: "importing", done, total });
    }

    toast.success(
      importMode === "replace"
        ? `Inventory replaced: ${total} vehicle${total === 1 ? "" : "s"} imported`
        : `Imported ${total} vehicle${total === 1 ? "" : "s"}`
    );
    setPhase({ step: "done", imported: total, deleted });
    router.refresh();
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold">Import vehicles from CSV</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Required columns: <code>year, make, model, price</code>. Optional:{" "}
          <code>
            trim, mileage, body_style, exterior_color, interior_color, drivetrain,
            fuel_type, image_src, seller_city, seller_state, stock_type, external_id
          </code>
          . Header names are case-insensitive; camelCase works too.
        </p>
      </header>

      {phase.step === "pick" && (
        <label className="block rounded-lg border-2 border-dashed border-input p-10 text-center cursor-pointer hover:border-neutral-400 transition-colors">
          <span className="text-sm text-muted-foreground">
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

      {phase.step === "checking" && (
        <p className="text-sm text-muted-foreground" role="status">
          Checking <strong>{phase.fileName}</strong> against your current inventory…
        </p>
      )}

      {phase.step === "preview" && (
        <PreviewPanel
          fileName={phase.fileName}
          parsed={phase.parsed}
          duplicates={phase.duplicates}
          existingCount={phase.existingCount}
          mode={mode}
          onModeChange={setMode}
          skipped={skipped}
          onToggleSkip={(index) =>
            setSkipped((prev) => {
              const next = new Set(prev);
              if (next.has(index)) next.delete(index);
              else next.add(index);
              return next;
            })
          }
          onBack={() => setPhase({ step: "pick" })}
          onImport={() => void runImport(phase.parsed, mode, phase.existingCount)}
        />
      )}

      {phase.step === "importing" && (
        <p className="text-sm text-muted-foreground" role="status">
          Importing… {phase.done}/{phase.total}
        </p>
      )}

      {phase.step === "done" && (
        <div className="space-y-3">
          <p className="text-sm text-green-600" role="status">
            {phase.deleted > 0
              ? `Replaced ${phase.deleted} vehicle${phase.deleted === 1 ? "" : "s"} with ${phase.imported} imported row${phase.imported === 1 ? "" : "s"}.`
              : `Imported ${phase.imported} vehicle${phase.imported === 1 ? "" : "s"}.`}
          </p>
          <Link
            href={`/admin/${tenantSlug}/vehicles`}
            className="inline-block rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Back to inventory
          </Link>
        </div>
      )}

      {phase.step === "failed" && (
        <div className="space-y-3">
          <p className="text-sm text-destructive" role="alert">
            Import stopped after {phase.imported} rows: {phase.message}
          </p>
          <button
            type="button"
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
            onClick={() => setPhase({ step: "pick" })}
          >
            Start over
          </button>
        </div>
      )}
    </div>
  );
}

/** Page through the tenant's inventory; RLS scopes it, tenant_id is belt-and-braces. */
async function fetchExistingFingerprints(tenantId: string): Promise<VehicleFingerprint[]> {
  const supabase = createSupabaseBrowserClient();
  const fingerprints: VehicleFingerprint[] = [];
  for (let from = 0; ; from += FINGERPRINT_PAGE) {
    const { data, error } = await supabase
      .from("vehicles")
      .select("external_id, year, make, model, trim, mileage")
      .eq("tenant_id", tenantId)
      .range(from, from + FINGERPRINT_PAGE - 1);
    if (error) throw new Error(error.message);
    fingerprints.push(...(data ?? []));
    if (!data || data.length < FINGERPRINT_PAGE) break;
  }
  return fingerprints;
}

function PreviewPanel({
  fileName,
  parsed,
  duplicates,
  existingCount,
  mode,
  onModeChange,
  skipped,
  onToggleSkip,
  onBack,
  onImport,
}: {
  fileName: string;
  parsed: VehicleImportResult;
  duplicates: Map<number, DuplicateReason>;
  existingCount: number;
  mode: ImportMode;
  onModeChange: (mode: ImportMode) => void;
  skipped: Set<number>;
  onToggleSkip: (index: number) => void;
  onBack: () => void;
  onImport: () => void;
}) {
  const importCount = useMemo(
    () =>
      mode === "replace"
        ? parsed.rows.length
        : parsed.rows.filter((_, index) => !skipped.has(index)).length,
    [mode, parsed.rows, skipped]
  );
  const skippedCount = parsed.rows.length - importCount;
  const duplicateEntries = useMemo(
    () => [...duplicates.entries()].sort(([a], [b]) => a - b),
    [duplicates]
  );
  const canImport = importCount > 0;

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <strong>{fileName}</strong>: {parsed.rows.length} valid row
        {parsed.rows.length === 1 ? "" : "s"}
        {duplicates.size > 0 && (
          <span className="text-amber-600">
            , {duplicates.size} duplicate{duplicates.size === 1 ? "" : "s"} of current inventory
          </span>
        )}
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

      <fieldset className="rounded-xl border p-4 space-y-3">
        <legend className="px-1 text-sm font-medium">Import mode</legend>
        <label className="flex items-start gap-3 text-sm cursor-pointer">
          <input
            type="radio"
            name="importMode"
            className="mt-0.5 accent-primary"
            checked={mode === "add"}
            onChange={() => onModeChange("add")}
          />
          <span>
            <span className="font-medium">Add to inventory</span>
            <span className="block text-xs text-muted-foreground">
              Appends the CSV rows to your {existingCount.toLocaleString()} existing vehicle
              {existingCount === 1 ? "" : "s"}. Duplicates are skipped unless you tick them below.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm cursor-pointer">
          <input
            type="radio"
            name="importMode"
            className="mt-0.5 accent-primary"
            checked={mode === "replace"}
            onChange={() => onModeChange("replace")}
          />
          <span>
            <span className="font-medium">Replace entire inventory</span>
            <span className="block text-xs text-muted-foreground">
              Deletes all {existingCount.toLocaleString()} existing vehicle
              {existingCount === 1 ? "" : "s"}, then imports every valid CSV row.
            </span>
          </span>
        </label>
      </fieldset>

      {mode === "add" && duplicateEntries.length > 0 && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-800">
          <p className="px-3 py-2 text-xs text-amber-700 dark:text-amber-500">
            These rows already exist in your inventory (matched by{" "}
            {duplicateEntries.some(([, reason]) => reason === "external_id")
              ? "external ID or year/make/model/trim/mileage"
              : "year/make/model/trim/mileage"}
            ). Tick a row to import it anyway.
          </p>
          <ul className="max-h-56 overflow-y-auto divide-y divide-amber-100 dark:divide-amber-900/40 text-xs">
            {duplicateEntries.map(([index, reason]) => {
              const row = parsed.rows[index];
              return (
                <li key={index} className="flex items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={!skipped.has(index)}
                    onChange={() => onToggleSkip(index)}
                    aria-label={`Import duplicate ${row.year} ${row.make} ${row.model}`}
                  />
                  <span className="flex-1">
                    {row.year} {row.make} {row.model} {row.trim || ""} — $
                    {row.price.toLocaleString()}
                    {row.mileage !== null && row.mileage !== undefined
                      ? `, ${row.mileage.toLocaleString()} mi`
                      : ""}
                  </span>
                  <span className="text-muted-foreground">
                    {reason === "external_id" ? "same external ID" : "same attributes"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {parsed.rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50">
                {["Year", "Make", "Model", "Trim", "Price", "Mileage", "Body"].map((h) => (
                  <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground">
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
            <p className="px-3 py-2 text-xs text-muted-foreground">
              …and {parsed.rows.length - PREVIEW_ROWS} more rows
            </p>
          )}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        {mode === "replace"
          ? `Summary: delete ${existingCount.toLocaleString()} existing, then import ${importCount.toLocaleString()}.`
          : `Summary: import ${importCount.toLocaleString()}${skippedCount > 0 ? `, skip ${skippedCount.toLocaleString()} duplicate${skippedCount === 1 ? "" : "s"}` : ""}.`}
      </p>

      <div className="flex gap-3">
        {mode === "replace" ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                disabled={!canImport}
                className="rounded-lg bg-destructive text-white px-4 py-2 text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Replace inventory with {importCount.toLocaleString()} vehicle
                {importCount === 1 ? "" : "s"}
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Replace entire inventory?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes all {existingCount.toLocaleString()} vehicle
                  {existingCount === 1 ? "" : "s"} currently in your inventory, then imports{" "}
                  {importCount.toLocaleString()} row{importCount === 1 ? "" : "s"} from{" "}
                  {fileName}. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  onClick={onImport}
                >
                  Delete and import
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <button
            type="button"
            disabled={!canImport}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={onImport}
          >
            Import {importCount.toLocaleString()} vehicle{importCount === 1 ? "" : "s"}
          </button>
        )}
        <button
          type="button"
          className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          onClick={onBack}
        >
          Choose another file
        </button>
      </div>
    </div>
  );
}
