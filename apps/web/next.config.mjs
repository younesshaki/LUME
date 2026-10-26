import { fileURLToPath } from "node:url";
import { assertPreviewEnvironment } from "./config/environment.ts";

if (process.env.WEB_PREVIEW_SANITIZED !== "1")
  throw new Error("Use the @lume/web scripts to isolate preview credentials");
assertPreviewEnvironment(process.env);
export default {
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  transpilePackages: ["@lume/types"],
  htmlLimitedBots: /.*/,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};
