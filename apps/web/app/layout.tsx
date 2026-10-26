import type { ReactNode } from "react";
import type { Metadata } from "next";
import "./style.css";

export const metadata: Metadata = {
  title: "LUME web foundation preview",
  robots: { index: false, follow: false, nocache: true },
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
