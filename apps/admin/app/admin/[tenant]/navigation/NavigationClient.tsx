"use client";

/**
 * Header/navigation settings for the public site. Nav ITEMS come from the
 * tenant's published pages (order managed on the Pages screen); this screen
 * controls how many fit in the header and the CTA button, persisted under
 * tenants.theme.header (merged — other theme keys are preserved).
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DEFAULT_TENANT_THEME,
  FOOTER_COLUMN_LIMITS,
  HEADER_NAV_LIMITS,
  clampFooterColumns,
  clampMaxNavItems,
  selectHeaderNav,
  type NavPageEntry,
  type TenantFooterVariant,
  type TenantHeaderVariant,
  type TenantTheme,
} from "@lume/types";
import type { Database } from "@lume/db";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type NavigationClientProps = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  initialTheme: TenantTheme;
  navPages: NavPageEntry[];
};

const HEADER_VARIANTS: ReadonlyArray<{
  id: TenantHeaderVariant;
  label: string;
  description: string;
}> = [
  { id: "centred", label: "Centred", description: "Logo left, navigation centred, actions right. The default." },
  { id: "left", label: "Left aligned", description: "Navigation sits beside the logo, actions pushed to the right." },
  { id: "split", label: "Split", description: "Navigation and actions share the space evenly." },
  { id: "minimal", label: "Minimal", description: "Navigation collapses into a menu; only the logo and actions show." },
];

const FOOTER_VARIANTS: ReadonlyArray<{
  id: TenantFooterVariant;
  label: string;
  description: string;
}> = [
  { id: "stacked", label: "Stacked", description: "Centred logo with a single wrapped link row. The default." },
  { id: "columns", label: "Columns", description: "Links laid out in columns, better for larger sites." },
  { id: "minimal", label: "Minimal", description: "Logo and legal bar only." },
];

export default function NavigationClient({
  tenantId,
  tenantSlug,
  tenantName,
  initialTheme,
  navPages,
}: NavigationClientProps) {
  const router = useRouter();
  const defaults = DEFAULT_TENANT_THEME.header;
  const [maxNavItems, setMaxNavItems] = useState<number>(
    clampMaxNavItems(initialTheme.header?.maxNavItems)
  );
  const [showCta, setShowCta] = useState<boolean>(initialTheme.header?.showCta ?? defaults.showCta);
  const [ctaLabel, setCtaLabel] = useState<string>(
    initialTheme.header?.ctaLabel ?? defaults.ctaLabel
  );
  const [headerVariant, setHeaderVariant] = useState<TenantHeaderVariant>(
    initialTheme.header?.variant ?? "centred"
  );
  const [sticky, setSticky] = useState<boolean>(initialTheme.header?.sticky ?? true);
  const [showVisitorTab, setShowVisitorTab] = useState<boolean>(
    initialTheme.header?.showVisitorTab ?? true
  );
  const [footerVariant, setFooterVariant] = useState<TenantFooterVariant>(
    initialTheme.footer?.variant ?? "stacked"
  );
  const [footerColumns, setFooterColumns] = useState<number>(
    clampFooterColumns(initialTheme.footer?.columns)
  );
  const [showSocial, setShowSocial] = useState<boolean>(
    initialTheme.footer?.showSocial ?? true
  );
  const [saving, setSaving] = useState(false);

  const { visible, overflow } = useMemo(
    () => selectHeaderNav(navPages, { maxNavItems }),
    [navPages, maxNavItems]
  );

  async function save() {
    setSaving(true);
    try {
      const theme: TenantTheme = {
        ...initialTheme,
        header: {
          maxNavItems: clampMaxNavItems(maxNavItems),
          // showCta/ctaLabel are deliberately still written. resolveHeaderCtas
          // reads them whenever `ctas` is absent, and this screen does not yet
          // edit multiple CTAs — dropping them here would blank the header CTA
          // for every tenant that saves from this page.
          showCta,
          ctaLabel: ctaLabel.trim() || defaults.ctaLabel,
          variant: headerVariant,
          sticky,
          showVisitorTab,
        },
        footer: {
          ...initialTheme.footer,
          variant: footerVariant,
          columns: clampFooterColumns(footerColumns),
          showSocial,
        },
      };
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("tenants")
        .update({ theme } as Database["public"]["Tables"]["tenants"]["Update"])
        .eq("id", tenantId);
      if (error) throw new Error(error.message);
      toast.success("Navigation settings saved");
      router.refresh();
    } catch (error) {
      toast.error("Unable to save navigation settings", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Navigation"
        description={`How ${tenantName}'s public site header presents your published pages.`}
        actions={
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Header settings</CardTitle>
          <CardDescription>
            Pages appear in the order set on the{" "}
            <Link href={`/admin/${tenantSlug}/pages`} className="underline underline-offset-2">
              Pages
            </Link>{" "}
            screen (drag rows to reorder). Only published, non-archived pages are shown.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="maxNavItems">Pages shown in the header</Label>
            <Input
              id="maxNavItems"
              type="number"
              min={HEADER_NAV_LIMITS.min}
              max={HEADER_NAV_LIMITS.max}
              value={maxNavItems}
              onChange={(e) => setMaxNavItems(Number(e.target.value))}
              onBlur={() => setMaxNavItems(clampMaxNavItems(maxNavItems))}
              className="w-24"
            />
            <p className="text-xs text-muted-foreground">
              Between {HEADER_NAV_LIMITS.min} and {HEADER_NAV_LIMITS.max}. Pages beyond this
              stay reachable by URL but leave the header.
            </p>
          </div>

          {/* Header layout. Every variant is a three-track grid, so the nav
              always collapses rather than overlapping — see SiteHeader. */}
          <div className="space-y-2">
            <span className="text-sm font-medium">Header layout</span>
            <div className="flex flex-wrap gap-2">
              {HEADER_VARIANTS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={headerVariant === option.id}
                  onClick={() => setHeaderVariant(option.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    headerVariant === option.id
                      ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-950"
                      : "border-neutral-300 text-muted-foreground hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {HEADER_VARIANTS.find((option) => option.id === headerVariant)?.description}
            </p>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="accent-primary size-4"
                checked={sticky}
                onChange={(e) => setSticky(e.target.checked)}
              />
              <span className="font-medium">Keep the header pinned while scrolling</span>
            </label>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="accent-primary size-4"
                checked={showVisitorTab}
                onChange={(e) => setShowVisitorTab(e.target.checked)}
              />
              <span className="font-medium">Show the visitor account button</span>
            </label>
            <p className="text-xs text-muted-foreground">
              Hiding it also hides saved vehicles and sign-in for returning visitors.
            </p>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="accent-primary size-4"
                checked={showCta}
                onChange={(e) => setShowCta(e.target.checked)}
              />
              <span className="font-medium">Show the call-to-action button</span>
            </label>
            <p className="text-xs text-muted-foreground">
              The highlighted button on the right side of the header; it opens the contact page.
            </p>
          </div>

          {showCta && (
            <div className="space-y-2">
              <Label htmlFor="ctaLabel">Call-to-action label</Label>
              <Input
                id="ctaLabel"
                type="text"
                value={ctaLabel}
                maxLength={40}
                onChange={(e) => setCtaLabel(e.target.value)}
                placeholder={defaults.ctaLabel}
                className="max-w-xs"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Footer settings</CardTitle>
          <CardDescription>
            The footer had no settings before now, so leaving these alone keeps your current
            footer exactly as it is.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <span className="text-sm font-medium">Footer layout</span>
            <div className="flex flex-wrap gap-2">
              {FOOTER_VARIANTS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={footerVariant === option.id}
                  onClick={() => setFooterVariant(option.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    footerVariant === option.id
                      ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-950"
                      : "border-neutral-300 text-muted-foreground hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {FOOTER_VARIANTS.find((option) => option.id === footerVariant)?.description}
            </p>
          </div>

          {footerVariant === "columns" && (
            <div className="space-y-2">
              <Label htmlFor="footerColumns">Footer columns</Label>
              <Input
                id="footerColumns"
                type="number"
                min={FOOTER_COLUMN_LIMITS.min}
                max={FOOTER_COLUMN_LIMITS.max}
                value={footerColumns}
                onChange={(e) => setFooterColumns(Number(e.target.value))}
                className="max-w-24"
              />
              <p className="text-xs text-muted-foreground">
                Between {FOOTER_COLUMN_LIMITS.min} and {FOOTER_COLUMN_LIMITS.max}.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <label className="flex items-center gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="accent-primary size-4"
                checked={showSocial}
                onChange={(e) => setShowSocial(e.target.checked)}
              />
              <span className="font-medium">Show social links</span>
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Header preview</CardTitle>
          <CardDescription>
            {visible.length.toLocaleString()} page{visible.length === 1 ? "" : "s"} in the header
            {overflow.length > 0
              ? `, ${overflow.length.toLocaleString()} beyond the limit`
              : ""}
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {navPages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No published pages yet — publish pages on the Pages screen and they&apos;ll appear
              here.
            </p>
          ) : (
            <>
              <ol className="space-y-1">
                {visible.map((page, index) => (
                  <li key={page.slug} className="flex items-center gap-3 text-sm">
                    <span className="w-5 text-right tabular-nums text-muted-foreground">
                      {index + 1}.
                    </span>
                    <span className="font-medium">{page.title || page.slug}</span>
                    <span className="font-mono text-xs text-muted-foreground">/{page.slug}</span>
                  </li>
                ))}
              </ol>
              {overflow.length > 0 && (
                <div className="rounded-lg border border-dashed p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Not shown in the header
                  </p>
                  <ul className="space-y-1">
                    {overflow.map((page) => (
                      <li key={page.slug} className="flex items-center gap-3 text-sm">
                        <Badge variant="outline" className="text-muted-foreground">
                          overflow
                        </Badge>
                        <span>{page.title || page.slug}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          /{page.slug}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
