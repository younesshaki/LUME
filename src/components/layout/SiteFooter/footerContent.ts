import { clampFooterColumns, type TenantFooterConfig } from "@lume/types";

/**
 * What the public footer shows for a tenant.
 *
 * The footer used to be LUME's own marketing footer rendered for every
 * tenant: a hotel tagline ("The only hotel you cannot book."), a Monaco
 * address, "© LUME", and links to the bare instagram.com / x.com /
 * youtube.com home pages. A dealership demoing its site showed all of that
 * (confirmed on the demo tenant, 2026-09-26: `showSocial: true` with no
 * configured links fell back to the generic ones).
 *
 * Now LUME's house copy and default social links belong to the LUME house
 * tenant only. Any other tenant shows its own name, only the social links it
 * configured (none rather than fake ones), and no LUME tagline or address.
 */

/** The slug of LUME's own site, which keeps the historical footer copy. */
export const LUME_HOUSE_TENANT_SLUG = "default";

export type FooterLink = { label: string; href: string };

export type FooterContent = {
  variant: NonNullable<TenantFooterConfig["variant"]>;
  columns: number;
  showNav: boolean;
  /** LUME house copy; null for every other tenant. */
  tagline: string | null;
  address: string | null;
  /** Name after the ©. Empty until a non-house tenant's name is known. */
  copyrightName: string;
  /** Configured social links; `useDefaultSocial` means "render LUME's own". */
  socialLinks: FooterLink[];
  useDefaultSocial: boolean;
  legalLinks: FooterLink[];
};

export function footerContent(input: {
  tenantSlug: string;
  tenantName: string | null;
  footer: TenantFooterConfig | undefined;
}): FooterContent {
  const isHouse = input.tenantSlug === LUME_HOUSE_TENANT_SLUG;
  const footer = input.footer;
  const variant = footer?.variant ?? "stacked";
  const configuredSocial = (footer?.socialLinks ?? []).filter(
    (link) => link.label?.trim() && link.href?.trim(),
  );
  const showSocial = footer?.showSocial ?? true;

  return {
    variant,
    columns: clampFooterColumns(footer?.columns),
    // `minimal` drops the nav and address; the legal bar always stays,
    // because cookie preferences and copyright are not optional.
    showNav: variant !== "minimal",
    tagline: isHouse ? "The only hotel you cannot book." : null,
    address:
      isHouse && variant !== "minimal"
        ? "Monaco, Principauté de Monaco · Invitation by referral only"
        : null,
    copyrightName: isHouse ? "LUME" : (input.tenantName?.trim() ?? ""),
    socialLinks: showSocial ? configuredSocial : [],
    useDefaultSocial: showSocial && isHouse && configuredSocial.length === 0,
    legalLinks: footer?.legalLinks?.length
      ? footer.legalLinks
      : [{ label: "Privacy", href: "/privacy" }],
  };
}
