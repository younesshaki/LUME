"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { updateSidebarExpandPreference } from "./actions";

export function SystemPreferencesClient({
  slug,
  initialSidebarSingleExpand,
}: {
  slug: string;
  initialSidebarSingleExpand: boolean;
}) {
  const [sidebarSingleExpand, setSidebarSingleExpand] = useState(initialSidebarSingleExpand);
  const [pending, startTransition] = useTransition();

  const changeSidebarExpandPreference = (nextValue: boolean) => {
    const previousValue = sidebarSingleExpand;
    setSidebarSingleExpand(nextValue);
    startTransition(async () => {
      const result = await updateSidebarExpandPreference(slug, nextValue);
      if (result.error) {
        setSidebarSingleExpand(previousValue);
        toast.error(result.error);
        return;
      }
      toast.success(nextValue ? "Sidebar now keeps one section expanded." : "Sidebar can keep multiple sections expanded.");
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sidebar</CardTitle>
        <CardDescription>
          This preference is saved for your account in this tenant.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/30 p-4">
          <div>
            <label htmlFor="sidebar-single-expand" className="text-sm font-medium">
              Keep one dropdown expanded
            </label>
            <p id="sidebar-single-expand-help" className="mt-1 text-sm text-muted-foreground">
              Opening a sidebar section closes the others. Turn this off to keep multiple sections open.
            </p>
          </div>
          <Switch
            id="sidebar-single-expand"
            checked={sidebarSingleExpand}
            disabled={pending}
            onCheckedChange={changeSidebarExpandPreference}
            aria-describedby="sidebar-single-expand-help"
          />
        </div>
      </CardContent>
    </Card>
  );
}
