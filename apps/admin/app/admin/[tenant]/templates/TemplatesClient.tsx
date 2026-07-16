"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, Layers3 } from "lucide-react";
import {
  applyTemplateToDesign,
  listSiteTemplates,
  resolveModeColors,
  type SiteMode,
} from "@lume/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import { saveDesignDraft } from "@/lib/siteDesignDraft";

type TemplatesClientProps = {
  tenantSlug: string;
  tenantName: string;
  publishedDesign: import("@lume/types").SiteDesign;
  canManage: boolean;
};

export default function TemplatesClient({
  tenantSlug,
  tenantName,
  publishedDesign,
  canManage,
}: TemplatesClientProps) {
  const router = useRouter();
  const templates = listSiteTemplates();
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const preview = templates.find((template) => template.key === previewKey) ?? null;
  const pending = templates.find((template) => template.key === pendingKey) ?? null;

  function useTemplate() {
    if (!pending || !canManage) return;
    const draft = applyTemplateToDesign(publishedDesign, pending);
    saveDesignDraft(window.sessionStorage, tenantSlug, draft, publishedDesign);
    setPendingKey(null);
    router.push(`/admin/${tenantSlug}/design?source=template`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Website Templates"
        description={`Choose a visual starting point for ${tenantName}. Selection stays private until you publish from Website Design.`}
      />

      <div className="rounded-xl border bg-muted/40 p-4 text-sm">
        <p className="font-medium">Templates change the website&apos;s visual design.</p>
        <p className="mt-1 text-muted-foreground">
          They do not replace inventory, pages, leads, customers, contact details, or navigation.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => {
          const selected = publishedDesign.template.key === template.key;
          return (
            <Card key={template.key} className="relative">
              <CardContent>
                <TemplatePreview template={template} mode="dark" />
              </CardContent>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{template.name}</CardTitle>
                    <CardDescription className="mt-1">{template.description}</CardDescription>
                  </div>
                  {selected ? <Badge variant="secondary"><Check /> Current</Badge> : null}
                </div>
              </CardHeader>
              <CardFooter className="justify-end gap-2">
                <Button variant="outline" onClick={() => setPreviewKey(template.key)}>
                  <Eye /> Preview
                </Button>
                <Button disabled={!canManage} onClick={() => setPendingKey(template.key)}>
                  <Layers3 /> Use template
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {!canManage ? (
        <p className="text-sm text-muted-foreground" role="status">
          Owner or admin access is required to prepare and publish a website design.
        </p>
      ) : null}

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreviewKey(null)}>
        <DialogContent className="sm:max-w-3xl">
          {preview ? (
            <>
              <DialogHeader>
                <DialogTitle>{preview.name} website preview</DialogTitle>
                <DialogDescription>Dark and light are intentional, independent website modes.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                <TemplatePreview template={preview} mode="dark" labelled />
                <TemplatePreview template={preview} mode="light" labelled />
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pending)} onOpenChange={(open) => !open && setPendingKey(null)}>
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Use {pending?.name} as your design draft?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left">
                <p>This resets draft colors, fonts, backgrounds, dock, and cinematic settings.</p>
                <p>It keeps your logo, favicons, pages, navigation, contact details, inventory, and domains.</p>
                <p className="font-medium text-foreground">Nothing changes on the public website until you publish.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={useTemplate}>Prepare draft</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TemplatePreview({
  template,
  mode,
  labelled = false,
}: {
  template: ReturnType<typeof listSiteTemplates>[number];
  mode: SiteMode;
  labelled?: boolean;
}) {
  const colors = resolveModeColors({
    schemaVersion: 2,
    template: { key: template.key, version: template.version },
    shared: {},
    modes: { dark: {}, light: {} },
  }, template, mode);
  return (
    <div>
      {labelled ? <p className="mb-2 text-xs font-medium">Website {mode} mode</p> : null}
      <div
        className="aspect-[16/10] overflow-hidden rounded-lg border p-5"
        style={{ background: colors.background, color: colors.ink, borderColor: colors.line }}
      >
        <div className="text-[10px] uppercase tracking-[0.24em]" style={{ color: colors.gold }}>Luxury</div>
        <div className="mt-8 text-2xl font-medium">Curated vehicles.<br />Private attention.</div>
        <div className="mt-5 h-12 rounded-md border" style={{ background: colors.panel, borderColor: colors.line }} />
      </div>
    </div>
  );
}
