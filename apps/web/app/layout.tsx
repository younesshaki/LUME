import type { ReactNode } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { contentContext } from "../server/content/context";
import NavHistoryRecorder from "../components/concierge/NavHistoryRecorder";
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
  let ctx: Awaited<ReturnType<typeof contentContext>> | null = null;
  if (isContent)
    try {
      ctx = await contentContext();
    } catch {
      /* Route loaders keep the actual 404/5xx status; the root document must still render. */
    }
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
        <NavHistoryRecorder />
        {children}
      </body>
    </html>
  );
}
