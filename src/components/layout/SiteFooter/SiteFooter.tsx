import { mediaUrl } from "@/config/cdn";
import { openCookiePreferences } from "@/components/CookieBanner/CookieBanner";
import { Separator } from "@/components/ui/separator";
import { SITE_NAV_ITEMS, type SiteScreen } from "../siteNavigation";
import { preloadRouteModule } from "@/app-shell/routeModules";
import { useTenantTheme } from "@/lib/TenantThemeProvider";
import { clampFooterColumns } from "@lume/types";

const SOCIAL_LINKS = [
  {
    label: "Instagram",
    href: "https://instagram.com",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
        <circle cx="12" cy="12" r="4"/>
        <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none"/>
      </svg>
    ),
  },
  {
    label: "X (Twitter)",
    href: "https://x.com",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
  },
  {
    label: "YouTube",
    href: "https://youtube.com",
    icon: (
      <svg width="20" height="14" viewBox="0 0 24 17" fill="currentColor" aria-hidden>
        <path d="M23.495 2.66A3.008 3.008 0 0 0 21.38.535C19.505 0 12 0 12 0S4.495 0 2.62.535A3.008 3.008 0 0 0 .505 2.66C0 4.547 0 8.5 0 8.5s0 3.953.505 5.84a3.008 3.008 0 0 0 2.115 2.125C4.495 17 12 17 12 17s7.505 0 9.38-.535a3.008 3.008 0 0 0 2.115-2.125C24 12.453 24 8.5 24 8.5s0-3.953-.505-5.84zM9.545 12.068V4.932L15.818 8.5l-6.273 3.568z"/>
      </svg>
    ),
  },
];

type SiteFooterProps = {
  onNavigate: (screen: SiteScreen) => void;
};

const lumeLogoImage = mediaUrl("LUMElogo.png");

export function SiteFooter({ onNavigate }: SiteFooterProps) {
  const tenantTheme = useTenantTheme();
  const logoImage = tenantTheme.branding?.logoUrl ?? lumeLogoImage;

  // Until Phase 4 the footer had no configuration at all. Every default below
  // reproduces the previous hardcoded layout, so a tenant with no `footer` key
  // renders exactly as it did.
  const footer = tenantTheme.footer;
  const variant = footer?.variant ?? "stacked";
  const showSocial = footer?.showSocial ?? true;
  const columns = clampFooterColumns(footer?.columns);
  const socialLinks = footer?.socialLinks?.length
    ? footer.socialLinks.map((link) => ({ ...link, icon: null }))
    : SOCIAL_LINKS;
  const legalLinks = footer?.legalLinks?.length
    ? footer.legalLinks
    : [{ label: "Privacy", href: "/privacy" }, { label: "Legal", href: "/privacy" }];
  // `minimal` drops the nav and address entirely; the legal bar always stays,
  // because cookie preferences and copyright are not optional.
  const isMinimal = variant === "minimal";

  return (
    <footer className="relative bg-[var(--theme-lume-background,#000)] text-[var(--theme-lume-ink,#fff8ec)] border-t border-[var(--theme-lume-line)] mt-auto">
      {/* Top gradient bleed */}
      <div
        className="absolute top-0 left-0 right-0 h-20 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, transparent 0%, var(--theme-lume-background, #000) 100%)" }}
        aria-hidden
      />

      <div className="relative z-10 max-w-6xl mx-auto px-6 md:px-10 py-14 md:py-20">
        {/* Brand */}
        <div className="flex flex-col items-center gap-3 mb-12">
          <img
            src={logoImage}
            alt="Site logo"
            className="h-10 w-auto object-contain opacity-90"
            draggable={false}
          />
          <p className="text-[11px] tracking-[0.25em] uppercase text-[var(--theme-lume-soft)]"
            style={{ fontFamily: "Mileast, serif" }}>
            The only hotel you cannot book.
          </p>
        </div>

        {/* Separator with gold center accent */}
        <div className="relative flex items-center gap-4 mb-10">
          <Separator className="flex-1 bg-[var(--theme-lume-line)]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#C9A84C]/60 animate-pulse flex-shrink-0" />
          <Separator className="flex-1 bg-[var(--theme-lume-line)]" />
        </div>

        {/* Nav + Social. `columns` lays the nav out in a grid; `stacked` keeps the
            original single wrapped row; `minimal` omits it. */}
        {!isMinimal && (
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 mb-10">
          <nav
            aria-label="Footer navigation"
            className={
              variant === "columns"
                ? "grid gap-x-8 gap-y-3 text-center md:text-left"
                : "flex items-center gap-6 flex-wrap justify-center"
            }
            style={
              variant === "columns"
                ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
                : undefined
            }
          >
            {SITE_NAV_ITEMS.map((item) => (
              <button
                key={item.screen}
                onClick={() => onNavigate(item.screen)}
                onMouseEnter={() => preloadRouteModule(item.screen)}
                onFocus={() => preloadRouteModule(item.screen)}
                onPointerDown={() => preloadRouteModule(item.screen)}
                className="text-xs tracking-[0.18em] uppercase text-[var(--theme-lume-muted)]
                  hover:text-[var(--theme-lume-gold)] transition-colors duration-200 cursor-pointer"
              >
                {item.label}
              </button>
            ))}
          </nav>

          {showSocial && (
            <div className="flex items-center gap-5">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  className="text-[11px] tracking-widest uppercase text-[var(--theme-lume-soft)] hover:text-[var(--theme-lume-gold)] transition-colors duration-200"
                >
                  {/* Configured links have no bundled icon, so they fall back to
                      their label rather than rendering an empty anchor. */}
                  {social.icon ?? social.label}
                </a>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Address */}
        {!isMinimal && (
          <p className="text-center text-[11px] tracking-widest uppercase text-[var(--theme-lume-soft)] mb-10">
            Monaco, Principauté de Monaco &nbsp;·&nbsp; Invitation by referral only
          </p>
        )}

        {/* Legal bar */}
        <Separator className="bg-[var(--theme-lume-line)] mb-5" />
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-[11px] text-[var(--theme-lume-soft)] tracking-wide">
            © {new Date().getFullYear()} LUME. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            {legalLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-[11px] text-[var(--theme-lume-soft)] hover:text-[var(--theme-lume-ink)] transition-colors duration-200
                  tracking-wide cursor-pointer"
              >
                {link.label}
              </a>
            ))}
            <button
              onClick={openCookiePreferences}
              className="text-[11px] text-[var(--theme-lume-soft)] hover:text-[var(--theme-lume-ink)] transition-colors duration-200
                tracking-wide cursor-pointer"
            >
              Cookie preferences
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
