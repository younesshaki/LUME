// Local integration tests preload this INSIDE the actual Next process.
// Print names/status only; never dump environment values.
const forbidden = Object.keys(process.env).filter((n) =>
  /^(SUPABASE_|NEXT_PUBLIC_|VITE_|DEEPSEEK_|R2_|GH_TOKEN$|GITHUB_TOKEN$)/.test(
    n,
  ),
);
if (forbidden.length)
  throw new Error("Production bindings reached isolated Next process");
console.log(
  "WEB_PREVIEW_ENV_AUDIT:" +
    JSON.stringify({
      genericProductionBindingCount: forbidden.length,
      testMode: true,
    }),
);
