import type { Metadata } from "next";
import { DemoAccessForm } from "./demo-access-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

/** A deliberately plain, shareable entry point for the three demo accounts. */
export default function DemoAccessPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <DemoAccessForm />
    </main>
  );
}
