import { fileURLToPath } from "node:url";
import { assertPreviewEnvironment } from "./config/environment.ts";

if (process.env.WEB_PREVIEW_SANITIZED !== "1")
  throw new Error("Use the @lume/web scripts to isolate preview credentials");
assertPreviewEnvironment(process.env);
export default {
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  transpilePackages: ["@lume/types", "@lume/blocks"],
  htmlLimitedBots: /.*/,
  poweredByHeader: false,
  webpack(config) {
    // Vite leaves two already-broken Montserrat URLs as runtime fallbacks.
    // Preserve that behavior without changing the live stylesheet or silently
    // substituting a different font in the parity comparison.
    function inspect(rule) {
      for(const item of (Array.isArray(rule.use)?rule.use:rule.use?[rule.use]:[])) if(item && typeof item === "object" && item.loader?.includes("/css-loader/")) {
        const previous=item.options?.url;
        item.options={...item.options,url:(url,...args)=> /(?:^|\/)ui\/assets\/fonts\/montserrat\/Montserrat-(?:Regular|Light)\.otf$/.test(url)||url.startsWith("../assets/fonts/montserrat/") ? false : typeof previous === "function" ? previous(url,...args) : previous !== false};
      }
      for(const child of [...(rule.oneOf??[]),...(rule.rules??[])])inspect(child);
    }
    for(const rule of config.module.rules) if(rule && typeof rule === "object")inspect(rule);
    return config;
  },
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
