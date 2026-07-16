"use server";

import type { SiteDesign, SiteMode } from "@lume/types";
import {
  prepareSiteBackgroundUpload,
  publishSiteDesign,
  restoreSiteDesign,
} from "@/lib/siteDesign.server";
import type { SiteBackgroundCandidate } from "@/lib/siteDesignAssets";

export async function publishWebsiteDesignAction(slug: string, design: SiteDesign) {
  return publishSiteDesign(slug, design);
}

export async function prepareWebsiteBackgroundUploadAction(
  slug: string,
  mode: SiteMode,
  candidate: SiteBackgroundCandidate,
) {
  return prepareSiteBackgroundUpload(slug, mode, candidate);
}

export async function restoreWebsiteDesignAction(slug: string, revisionId: string) {
  return restoreSiteDesign(slug, revisionId);
}
