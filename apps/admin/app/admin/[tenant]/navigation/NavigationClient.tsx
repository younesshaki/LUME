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
  HEADER_NAV_LIMITS,
  clampMaxNavItems,
  selectHeaderNav,
  type NavPageEntry,
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
          showCta,
          ctaLabel: ctaLabel.trim() || defaults.ctaLabel,
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
