import {
  getSiteTemplate,
  normalizeSiteDesign,
  type SiteBackgroundAsset,
  type SiteColorKey,
  type SiteDesign,
  type SiteMode,
} from "@lume/types";

const DRAFT_VERSION = 1;

type StoredDesignDraft = {
  version: typeof DRAFT_VERSION;
  publishedSignature: string;
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
  published: SiteDesign,
): void {
  const payload: StoredDesignDraft = {
    version: DRAFT_VERSION,
    publishedSignature: designSignature(published),
    design,
  };
  storage.setItem(draftKey(tenantSlug), JSON.stringify(payload));
}

export function readDesignDraft(
  storage: DesignDraftStorage,
  tenantSlug: string,
  published: SiteDesign,
): SiteDesign | null {
  try {
    const raw = storage.getItem(draftKey(tenantSlug));
    if (!raw) return null;
    const payload = JSON.parse(raw) as Partial<StoredDesignDraft>;
    if (
      payload.version !== DRAFT_VERSION ||
      payload.publishedSignature !== designSignature(published) ||
      !payload.design
    ) {
      storage.removeItem(draftKey(tenantSlug));
      return null;
    }
    return normalizeSiteDesign(payload.design, getSiteTemplate(payload.design.template?.key));
  } catch {
    storage.removeItem(draftKey(tenantSlug));
    return null;
  }
}

export function clearDesignDraft(storage: DesignDraftStorage, tenantSlug: string): void {
  storage.removeItem(draftKey(tenantSlug));
}

function draftKey(tenantSlug: string): string {
  return `lume.site-design-draft.v1.${tenantSlug.trim().toLowerCase()}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
