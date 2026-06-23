import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages are imported as TS source — let Next.js compile them.
  transpilePackages: ["@lume/types", "@lume/db", "@lume/rag", "@lume/blocks", "@lume/bot"],
  experimental: {
    // Enable typed routes once we have stable routes; off for now to keep
    // scaffolding noise low.
  },
};

export default config;
