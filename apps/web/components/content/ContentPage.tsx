import { TemplateHomeView } from "@lume/blocks/react/TemplateHome";
import type { ReactNode } from "react";
import { CinematicShellView } from "@lume/blocks/react/CinematicShell";
import artwork from "../../../../src/experience/assets/images/lume-homepage-background.png";
import { contentPage } from "../../server/content/context";
import { ServerBlocks } from "./ServerBlocks";
import InteractiveForms from "./InteractiveForms";
import Consent from "./Consent";
export async function ContentPage({ slug }: { slug: string }) {
  const { tenant, page, state, mode, template, design } =
    await contentPage(slug);
  const frame = {
    home: ["storyHome", ""],
    contact: ["contactPage", "contactPage__main"],
    products: ["productsPage", "productsPage__main"],
  }[slug] ?? ["contactPage", "contactPage__main"];
  if (slug === "home" && state !== "published" && template.key !== "luxury")
    return (
      <div data-content-state={state} data-web-content>
        <TemplateHomeView
          template={template}
          Shell={Shell}
          Reveal={Reveal}
          actions={
            <div className="templateHome__actions">
              <a href={`/vehicles?tenant=${tenant.slug}`}>Explore inventory</a>
              <a href="#conversion">{template.conversion.primaryLabel}</a>
            </div>
          }
          Conversion={
            <InteractiveForms
              tenant={tenant.slug}
              siteKey={process.env.WEB_PREVIEW_TURNSTILE_SITE_KEY}
              design={design}
            />
          }
          Footer={
            <footer className="web-preview-footer">
              <p>Staging preview · noindex</p>
              <nav aria-label="Preview pages">
                {[
                  ["", "Home"],
                  ["products", "Products"],
                  ["services", "Services"],
                  ["vehicles", "Vehicles"],
                  ["contact", "Contact"],
                ].map(([path, label]) => (
                  <a
                    key={path}
                    href={`/${path}?tenant=${encodeURIComponent(tenant.slug)}&theme=${mode}&template=${template.key}`}
                  >
                    {label}
                  </a>
                ))}
              </nav>
              <Consent tenant={tenant.slug} name={tenant.name} />
            </footer>
          }
        />
      </div>
    );
  return (
    <CinematicShellView mode="standard" artwork={artwork.src}>
      <div
        className={frame[0]}
        style={
          slug === "home"
            ? ({
                "--story-home-bg-image": `url(${artwork.src})`,
              } as import("react").CSSProperties)
            : undefined
        }
        data-mode="standard"
        data-web-content
        data-content-state={state}
        data-published-revision={page.publishedRevisionId ?? undefined}
      >
        {slug === "home" && (
          <div className="storyHome__background" aria-hidden="true" />
        )}
        <main
          id={slug === "home" ? "top" : undefined}
          className={["pageBuilderMain", frame[1]].filter(Boolean).join(" ")}
          style={{
            paddingTop: "var(--page-builder-main-top, 72px)",
            paddingBottom: "var(--page-builder-main-bottom, 160px)",
          }}
        >
          {slug === "home" && (
            <div className="storyHome__tracingBeam" aria-hidden="true" />
          )}
          <ServerBlocks
            blocks={page.blocks.blocks}
            slug={slug}
            title={page.title}
            tenant={tenant.slug}
            mode={mode}
            template={template.key}
          />
          {slug === "contact" && (
            <InteractiveForms
              tenant={tenant.slug}
              siteKey={process.env.WEB_PREVIEW_TURNSTILE_SITE_KEY}
            />
          )}
        </main>
        {slug === "home" && template.key !== "glo3d" ? (
          <InteractiveForms
            tenant={tenant.slug}
            siteKey={process.env.WEB_PREVIEW_TURNSTILE_SITE_KEY}
            design={design}
          />
        ) : null}
        <footer className="web-preview-footer">
          <p>Staging preview · noindex</p>
          <nav aria-label="Preview pages">
            {[
              ["", "Home"],
              ["products", "Products"],
              ["services", "Services"],
              ["vehicles", "Vehicles"],
              ["contact", "Contact"],
            ].map(([path, label]) => (
              <a
                key={path}
                href={`/${path}?tenant=${encodeURIComponent(tenant.slug)}&theme=${mode}&template=${template.key}`}
              >
                {label}
              </a>
            ))}
          </nav>
          <Consent tenant={tenant.slug} name={tenant.name} />
        </footer>
      </div>
    </CinematicShellView>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <CinematicShellView mode="standard" artwork={artwork.src}>
      {children}
    </CinematicShellView>
  );
}
function Reveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}
