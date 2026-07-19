import {
  getSiteTemplate,
  normalizeSiteDesign,
  type SiteBackgroundAsset,
  type SiteColorKey,
  type SiteDesign,
  type SiteMode,
} from "@lume/types";

const DRAFT_VERSION = 2;

type StoredDesignDraft = {
  version: typeof DRAFT_VERSION;
  templateKey: string;
  design: SiteDesign;
};

export type DesignDraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function updateModeColor(design: SiteDesign, mode: SiteMode, key: SiteColorKey, value: string): SiteDesign {
  return {
    ...design,
    modes: {
      ...design.modes,
      [mode]: {
        ...design.modes[mode],
        colors: { ...design.modes[mode].colors, [key]: value },
      },
    },
  };
}

export function updateModeBackground(
  design: SiteDesign,
  mode: SiteMode,
  background: SiteBackgroundAsset | undefined,
): SiteDesign {
  return {
    ...design,
    modes: {
      ...design.modes,
      [mode]: {
        ...design.modes[mode],
        assets: background ? { siteBackground: background } : undefined,
      },
    },
  };
}

export function copyMode(design: SiteDesign, source: SiteMode, destination: SiteMode): SiteDesign {
  return {
    ...design,
    modes: { ...design.modes, [destination]: clone(design.modes[source]) },
  };
}

export function resetMode(design: SiteDesign, mode: SiteMode): SiteDesign {
  const template = getSiteTemplate(design.template.key);
  return { ...design, modes: { ...design.modes, [mode]: clone(template.modes[mode]) } };
}

export function designSignature(design: SiteDesign): string {
  return JSON.stringify(design);
}

export function hasDesignChanges(draft: SiteDesign, published: SiteDesign): boolean {
  return designSignature(draft) !== designSignature(published);
}

export function saveDesignDraft(
  storage: DesignDraftStorage,
  tenantSlug: string,
  design: SiteDesign,
): void {
  const templateKey = getSiteTemplate(design.template.key).key;
  const payload: StoredDesignDraft = {
    version: DRAFT_VERSION,
    templateKey,
    design,
  };
  storage.setItem(draftKey(tenantSlug, templateKey), JSON.stringify(payload));
}

export function readDesignDraft(
  storage: DesignDraftStorage,
  tenantSlug: string,
  templateKey: string,
): SiteDesign | null {
  const canonicalKey = getSiteTemplate(templateKey).key;
  try {
    const raw = storage.getItem(draftKey(tenantSlug, canonicalKey));
    if (!raw) return null;
    const payload = JSON.parse(raw) as Partial<StoredDesignDraft>;
    if (
      payload.version !== DRAFT_VERSION ||
      payload.templateKey !== canonicalKey ||
      !payload.design
    ) {
      storage.removeItem(draftKey(tenantSlug, canonicalKey));
      return null;
    }
    return normalizeSiteDesign(payload.design, getSiteTemplate(canonicalKey));
  } catch {
    storage.removeItem(draftKey(tenantSlug, canonicalKey));
    return null;
  }
}

export function clearDesignDraft(
  storage: DesignDraftStorage,
  tenantSlug: string,
  templateKey: string,
): void {
  storage.removeItem(draftKey(tenantSlug, getSiteTemplate(templateKey).key));
}

function draftKey(tenantSlug: string, templateKey: string): string {
  return `lume.site-design-draft.v2.${encodeURIComponent(tenantSlug.trim().toLowerCase())}.${templateKey}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
