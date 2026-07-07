"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Monitor,
  PanelTop,
  Palette,
  Plus,
  RefreshCw,
  Smartphone,
  Tablet,
} from "lucide-react";
import type { Page } from "@lume/types";

type WebsiteClientProps = {
  tenantSlug: string;
  tenantName: string;
  publicSiteBaseUrl: string;
  pages: Page[];
};

type Device = "desktop" | "tablet" | "mobile";

const DEVICE_WIDTH: Record<Device, number | null> = {
  desktop: null,
  tablet: 820,
  mobile: 414,
};

const DEVICES: Array<{ id: Device; label: string; icon: typeof Monitor }> = [
  { id: "desktop", label: "Desktop", icon: Monitor },
  { id: "tablet", label: "Tablet", icon: Tablet },
  { id: "mobile", label: "Mobile", icon: Smartphone },
];

/**
 * The "Website" hub: the single place a customer shapes their public site. It
 * pairs a true-to-production preview of the live site with direct entries into
 * every editable surface (pages/content, header, branding, media).
 */
export default function WebsiteClient({
  tenantSlug,
  tenantName,
  publicSiteBaseUrl,
  pages,
}: WebsiteClientProps) {
  const [device, setDevice] = useState<Device>("desktop");
  const [reloadKey, setReloadKey] = useState(0);

  const base = publicSiteBaseUrl.replace(/\/+$/, "");
  const previewUrl = useMemo(
    () => `${base}/home?tenant=${encodeURIComponent(tenantSlug)}&preview=lume`,
    [base, tenantSlug]
  );
  const validUrl = safeIsUrl(previewUrl);

  const editableSurfaces = [
    {
      href: `/admin/${tenantSlug}/pages`,
      icon: FileText,
      title: "Pages & content",
      description: "Add, edit, and publish pages. Arrange the blocks that make up each page.",
    },
    {
      href: `/admin/${tenantSlug}/navigation`,
      icon: PanelTop,
      title: "Header & navigation",
      description: "Choose which pages appear in the header and how the top bar behaves.",
    },
    {
      href: `/admin/${tenantSlug}/branding`,
      icon: Palette,
      title: "Branding & theme",
      description: "Set colors, logo, and typography that flow through the whole site.",
    },
    {
      href: `/admin/${tenantSlug}/assets`,
      icon: ImageIcon,
      title: "Media assets",
      description: "Upload and manage the images used across pages and blocks.",
    },
  ];

  const livePages = pages.filter((page) => page.archivedAt === null);
  const width = DEVICE_WIDTH[device];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Website</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Shape {tenantName}&rsquo;s public site and preview exactly how it looks before it goes live.
          </p>
        </div>
        {validUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
          >
            <ExternalLink className="size-4" />
            Open live site
          </a>
        )}
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {editableSurfaces.map((surface) => (
          <Link
            key={surface.href}
            href={surface.href}
            className="group rounded-xl border border-neutral-200 p-4 transition-colors hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:border-neutral-700 dark:hover:bg-neutral-900/50"
          >
            <surface.icon className="size-5 text-muted-foreground group-hover:text-foreground" />
            <h2 className="mt-3 text-sm font-semibold">{surface.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{surface.description}</p>
          </Link>
        ))}
      </section>

      <section className="rounded-xl border border-neutral-200 dark:border-neutral-800">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 p-3 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Live site preview</h2>
          <div className="flex items-center gap-1">
            <div className="mr-1 flex items-center gap-0.5 rounded-lg border border-neutral-200 p-0.5 dark:border-neutral-800">
              {DEVICES.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  title={label}
                  aria-pressed={device === id}
                  onClick={() => setDevice(id)}
                  className={`rounded-md p-1.5 ${
                    device === id
                      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                      : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  }`}
                >
                  <Icon className="size-4" />
                </button>
              ))}
            </div>
            <button
              type="button"
              title="Reload preview"
              onClick={() => setReloadKey((key) => key + 1)}
              className="rounded-md border border-neutral-200 p-1.5 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-800"
            >
              <RefreshCw className="size-4" />
            </button>
          </div>
        </div>

        {validUrl ? (
          <div className="flex justify-center overflow-auto bg-neutral-100 p-4 dark:bg-neutral-950">
            <div
              className="h-[70vh] w-full overflow-hidden rounded-lg border border-neutral-300 bg-black shadow-sm transition-[max-width] dark:border-neutral-700"
              style={{ maxWidth: width ? `${width}px` : "100%" }}
            >
              <iframe
                key={reloadKey}
                src={previewUrl}
                title="Live site preview"
                className="h-full w-full border-0"
              />
            </div>
          </div>
        ) : (
          <div className="p-6 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Preview site URL isn&rsquo;t set.</p>
            <p className="mt-1">
              Set <code>NEXT_PUBLIC_PUBLIC_SITE_URL</code> to your public site origin (for local dev,{" "}
              <code>http://localhost:5173</code>).
            </p>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-2 border-b border-neutral-200 p-3 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Pages</h2>
          <Link
            href={`/admin/${tenantSlug}/pages/new`}
            className="inline-flex items-center gap-1.5 rounded-md bg-neutral-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
          >
            <Plus className="size-3.5" />
            New page
          </Link>
        </div>
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {livePages.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground">No pages yet.</li>
          )}
          {livePages.map((page) => (
            <li key={page.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{page.title || page.slug}</p>
                <code className="text-xs text-muted-foreground">/{page.slug}</code>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{pageStatus(page)}</span>
                <Link
                  href={`/admin/${tenantSlug}/pages/${page.id}`}
                  className="text-xs font-medium text-neutral-600 hover:text-neutral-950 dark:text-muted-foreground dark:hover:text-white"
                >
                  Edit
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function pageStatus(page: Page): string {
  if (page.draftRevisionId && page.publishedRevisionId) return "Published · draft";
  if (page.draftRevisionId) return "Draft";
  if (page.publishedRevisionId) return "Published";
  return "Empty";
}

function safeIsUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
