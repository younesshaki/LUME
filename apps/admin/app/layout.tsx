import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LUME Admin",
  description: "Admin dashboard for LUME-powered sites.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
