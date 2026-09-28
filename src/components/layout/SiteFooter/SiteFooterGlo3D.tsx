import { useState, type ReactNode } from "react";
import { mediaUrl } from "@/config/cdn";
import { openCookiePreferences } from "@/components/CookieBanner/CookieBanner";
import { preloadRouteModule } from "@/app-shell/routeModules";
import type { SiteNavItem } from "../siteNavigation";
import type { FooterContent, FooterLink } from "./footerContent";
import "./SiteFooterGlo3D.css";

/** The template's showroom photo (plan §5); purely decorative. */
const SHOWROOM_PHOTO = mediaUrl("templates/glo3d/dealership-exterior-1200.webp");

type SiteFooterGlo3DProps = {
  content: FooterContent;
  logoImage: string | null;
  tenantName: string | null;
  navItems: readonly SiteNavItem[];
  socialLinks: ReadonlyArray<{ label: string; href: string; icon: ReactNode }>;
  legalLinks: readonly FooterLink[];
  onNavigate: (key: string) => void;
};

/**
 * Template Glo3D's footer: a physical dealership's footer rather than a brand
 * flourish. Adapted from HyperUI marketing footer 5 (MIT): photo panel, then
 * brand, page columns and social links, then the legal bar. Same data and
 * behaviour as SiteFooter (footerContent, tenant pages, cookie preferences);
 * only the presentation differs.
 */
export function SiteFooterGlo3D({
  content,
  logoImage,
  tenantName,
  navItems,
  socialLinks,
  legalLinks,
  onNavigate,
}: SiteFooterGlo3DProps) {
  const name = content.copyrightName || tenantName || "";
  const minimal = !content.showNav;
  // A missing photo drops the panel instead of showing a broken image.
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = !minimal && !photoFailed;

  return (
    <footer className={`siteFooter glo3dFooter${showPhoto ? "" : " glo3dFooter--noPhoto"}${minimal ? " glo3dFooter--minimal" : ""}`}>
      {showPhoto ? (
        <div className="glo3dFooter__photo" aria-hidden="true">
          <img
            src={SHOWROOM_PHOTO}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setPhotoFailed(true)}
          />
        </div>
      ) : null}

      <div className="glo3dFooter__body">
        {minimal ? null : (
          <div className="glo3dFooter__top">
            <div className="glo3dFooter__brand">
              {logoImage ? (
                <img
                  className="glo3dFooter__logo"
                  src={logoImage}
                  alt={name ? `${name} logo` : "Site logo"}
                  draggable={false}
                />
              ) : null}
              {name ? <p className="glo3dFooter__name">{name}</p> : null}
              {content.tagline ? <p className="glo3dFooter__tagline">{content.tagline}</p> : null}
            </div>

            <nav
              aria-label="Footer navigation"
              className="glo3dFooter__nav"
              style={{ gridTemplateColumns: `repeat(${content.variant === "columns" ? content.columns : 2}, minmax(0, 1fr))` }}
            >
              {navItems.map((item) => (
                <button
                  key={item.screen}
                  type="button"
                  onClick={() => onNavigate(item.screen)}
                  onMouseEnter={() => preloadRouteModule(item.screen)}
                  onFocus={() => preloadRouteModule(item.screen)}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        )}

        {socialLinks.length > 0 ? (
          <ul className="glo3dFooter__social">
            {socialLinks.map((social) => (
              <li key={social.label}>
                <a href={social.href} target="_blank" rel="noopener noreferrer" aria-label={social.label}>
                  {social.icon ?? social.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="glo3dFooter__legal">
          <p>
            © {new Date().getFullYear()}
            {name ? ` ${name}` : ""}. All rights reserved.
          </p>
          <div className="glo3dFooter__legalLinks">
            {legalLinks.map((link) => (
              <a key={link.label} href={link.href}>
                {link.label}
              </a>
            ))}
            <button type="button" onClick={openCookiePreferences}>
              Cookie preferences
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
