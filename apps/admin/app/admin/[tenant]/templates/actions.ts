"use server";

import { prepareTemplateDraft } from "@/lib/siteDesign.server";

export async function prepareWebsiteTemplateDraftAction(
  slug: string,
  templateKey: string,
  reset = false,
) {
  return prepareTemplateDraft(slug, templateKey, reset);
}
