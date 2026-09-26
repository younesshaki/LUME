"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Car, Loader2 } from "lucide-react";
import { DEALER_PAGE_TEMPLATES } from "@lume/blocks";
import { createPage } from "@lume/db";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const VDP_SLUG = "vehicle";

type VehicleLayoutPanelProps = {
  tenantSlug: string;
  tenantId: string;
  /** Existing `vehicle` page id, when the tenant already has one. */
  existingPageId: string | null;
  /** Whether that page has a published revision. */
  isPublished: boolean;
  /** One tenant-owned inventory record used for an honest public preview. */
  sampleVehicle: { id: string; label: string } | null;
  publicSiteBaseUrl: string;
};

/**
 * The vehicle-detail layout, called out separately from the page list.
 *
 * This is deliberately not just another row. Every other page is one URL; this
 * one is the layout applied to *every* `/vehicles/:id`, and the engine for it
 * already existed but was undiscoverable — no tenant had ever created it. The
 * panel exists to make that capability visible and to state plainly what it
 * affects, because a dealer who writes "this Civic drives beautifully" into it
 * publishes that sentence onto their whole inventory.
 */
export function VehicleLayoutPanel({
  tenantSlug,
  tenantId,
  existingPageId,
  isPublished,
  sampleVehicle,
  publicSiteBaseUrl,
}: VehicleLayoutPanelProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    const template = DEALER_PAGE_TEMPLATES.find((page) => page.slug === VDP_SLUG);
    if (!template) {
      setError("The vehicle layout template is unavailable.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const client = createSupabaseBrowserClient() as unknown as Parameters<typeof createPage>[0];
      const page = await createPage(client, {
        tenantId,
        slug: template.slug,
        title: template.title,
        navOrder: template.navOrder,
        seoMeta: template.seoMeta,
        blocks: template.blocks,
      });
      router.push(`/admin/${tenantSlug}/pages/${page.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create the vehicle layout.");
      setCreating(false);
    }
  }

  return (
    <section
      aria-labelledby="vehicle-layout-heading"
      className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-3">
          <Car className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="space-y-1">
            <h2 id="vehicle-layout-heading" className="text-sm font-medium">
              Vehicle detail layout
            </h2>
            {/* The single most important sentence on this screen. */}
            <p className="max-w-prose text-sm text-muted-foreground">
              This is not one page — it is the layout used by{" "}
              <strong className="font-medium text-foreground">every vehicle</strong> in your
              inventory. Keep the copy general; anything specific to one car will appear on all of
              them.
            </p>
            {existingPageId ? (
              isPublished ? (
                <p className="max-w-prose text-xs text-muted-foreground">
                  Published — every vehicle currently uses this layout. You can unpublish it from
                  the editor at any time to restore LUME&apos;s built-in layout; your draft remains
                  saved and can be published again.
                </p>
              ) : (
                <p className="max-w-prose text-xs text-muted-foreground">
                  Draft only — visitors still see LUME&apos;s built-in layout until you publish. You
                  can edit and preview safely without changing any live vehicle page.
                </p>
              )
            ) : (
              <p className="max-w-prose text-xs text-muted-foreground">
                Not created yet. Your vehicle pages use LUME&apos;s built-in layout until you create
                and publish a draft.
              </p>
            )}
            {sampleVehicle ? (
              <a
                href={buildVehiclePreviewUrl(publicSiteBaseUrl, tenantSlug, sampleVehicle.id)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex text-xs font-medium text-foreground underline underline-offset-4 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Preview with sample vehicle: {sampleVehicle.label || "vehicle"}
              </a>
            ) : (
              <p className="text-xs text-muted-foreground">
                Add a vehicle to inventory to preview this layout with actual vehicle data.
              </p>
            )}
            {error && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
          </div>
        </div>

        {existingPageId ? (
          <Link
            href={`/admin/${tenantSlug}/pages/${existingPageId}`}
            className="shrink-0 rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Edit layout
          </Link>
        ) : (
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="inline-flex shrink-0 items-center gap-2 rounded-md bg-neutral-950 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
          >
            {creating && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {creating ? "Creating…" : "Create vehicle layout draft"}
          </button>
        )}
      </div>
    </section>
  );
}

function buildVehiclePreviewUrl(publicSiteBaseUrl: string, tenantSlug: string, vehicleId: string) {
  try {
    const url = new URL(publicSiteBaseUrl);
    url.pathname = `/vehicles/${encodeURIComponent(vehicleId)}`;
    url.searchParams.set("tenant", tenantSlug);
    return url.toString();
  } catch {
    return `/vehicles/${encodeURIComponent(vehicleId)}?tenant=${encodeURIComponent(tenantSlug)}`;
  }
}
