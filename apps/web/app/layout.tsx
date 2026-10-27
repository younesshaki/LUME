import type { ReactNode } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { contentContext } from "../server/content/context";
import "./tailwind.css";
import "./style.css";
import "@lume/blocks/styles.css";
import "./content.css";
export const metadata: Metadata = {
  title: "LUME web preview",
  robots: { index: false, follow: false, nocache: true },
};
export default async function Layout({ children }: { children: ReactNode }) {
  const h = await headers();
  const path = (h.get("x-web-request-path") ?? "/").split("?")[0];
  const isContent = !["/preview", "/vehicles", "/robots.txt"].some(
    (p) => path === p || path.startsWith(p + "/"),
  );
  const ctx = isContent ? await contentContext() : null;
  return (
    <html
      lang="en"
      data-theme={ctx?.mode}
      data-lume-site-mode={ctx?.mode}
      data-lume-template={ctx?.template.key}
      data-lume-template-layout={ctx?.template.visual.layout}
      style={ctx?.palette.variables}
    >
      <body className={ctx ? "standardMode" : "web-vehicle-shell"}>
        {children}
      </body>
    </html>
  );
}
