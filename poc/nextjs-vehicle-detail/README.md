# Disposable Next.js vehicle-detail proof

**Do not ship this as the public website.** This standalone Next 16 / React 19
experiment is outside root npm workspaces. It changes no Vite source, root
configuration, dependencies or deployment. Delete this directory to remove it.
The execution plan is [nextjs-migration-plan.md](../../docs/scalability/nextjs-migration-plan.md).

## What this proves

- Real active-tenant lookup and scoped live vehicle reads on the server.
- Title, description, canonical, OG tags, h1 and specs in raw HTML without JS.
- Query selection locally, strict test subdomain selection, conflicting selectors,
  wrong tenant and unknown host rejected with 404. Private/no-store responses.
- A real managed R2 vehicle photograph, visible before hydration.
- A client-only, click-loaded Three.js GLTF viewer and both existing example
  GLSL shaders, using Next webpack `asset/source` imports.
- A vehicle-context chat entry UI (no real chat calls or messages).

The real sample is `demo-max` / `07936ada-4478-5875-9ae4-757d51beab28`, a
2003 Ferrari 360 Spider. Its photo comes from managed gallery metadata. The GLB
is **the existing Red Bull product asset**, not a model of this vehicle. The
current public vehicle page uses a gallery; this proof does not invent a
vehicle-model database association.

The existing GLB does not send an `Access-Control-Allow-Origin` response for
the local browser origin. `/proof-model.glb` is a fixed-asset, read-only proxy
inside this POC so the actual model can be rendered. It accepts no user URL or
key. TLS is verified on the upstream fetch. This is evidence that local direct
R2 model CORS is unresolved, not a recommendation to proxy every production
asset. Production must allow its intended origins (or deliberately choose an
asset-serving architecture and account for its functions/egress).

This GLB requires Draco and WebP extensions. `npm run build` / `npm run dev`
generate `public/draco` from the integrity-locked Three.js package, including
the WASM decoder absent from the root public checkout. Generated decoders and
their upstream license stay ignored inside this POC; no root assets change.

## Reproduce

Use Node 24. Supply `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (for managed-gallery metadata) and
`R2_PUBLIC_BASE_URL` securely in the process or this directory's ignored
`.env.local`. `.env.example` lists the non-secret proof defaults. The server
never uses the service-role key to decide public vehicle visibility. No keys
are needed by the browser. Do not paste values into commands or commit them.

From repository root:

```sh
npm ci --prefix poc/nextjs-vehicle-detail --workspaces=false
cd poc/nextjs-vehicle-detail
npm run build
NODE_USE_ENV_PROXY=1 npm start
```

`NODE_USE_ENV_PROXY=1` is needed for Node fetch in this cloud's HTTPS proxy
environment; it is harmless on a machine with no proxy configured. Keep the
platform CA settings; do not disable TLS checks. The POC uses port 3100,
independent of Vite's 5173 and admin's 3000. `npm run dev` also exists, but the
proof was run against `npm run build` + `npm start`.

In a second terminal from this directory:

```sh
curl -fsS 'http://127.0.0.1:3100/vehicles/07936ada-4478-5875-9ae4-757d51beab28?tenant=demo-max'
curl -fsS -H 'Host: demo-max.lume.test' \
  'http://127.0.0.1:3100/vehicles/07936ada-4478-5875-9ae4-757d51beab28'
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright npm run verify
npm run typecheck
```

Use another writable browser-cache path on your own machine. Behind the cloud
proxy, Chromium needs the platform's trusted CA in its user NSS database in
addition to Node's `NODE_EXTRA_CA_CERTS`. On this machine `certutil` was used to
import that existing platform bundle; no certificates or verification were
bypassed. On a normal local network this is not required. The browser verifier
uses the configured HTTPS proxy for external media and bypasses it for loopback.
Its software WebGL flags are for headless CI; mobile hardware remains untested.

`verify` saves ignored `artifacts/vehicle.html` and `artifacts/viewer.png`,
checks raw HTML/no-JS browser content, attempts cross-tenant and hostile-host
requests, decodes the R2 image, verifies no GLB request before interaction,
loads the GLB after a click, renders GLSL in WebGL without browser errors,
opens the chat entry context and unmounts the canvas. The raw response includes:

```html
<title>2003 Ferrari 360 Spider | Max Auto</title>
<meta name="description" content="2003 Ferrari 360 Spider for sale at Max Auto. View photos, specifications and vehicle details."/>
<link rel="canonical" href="http://127.0.0.1:3100/vehicles/07936ada-4478-5875-9ae4-757d51beab28?tenant=demo-max"/>
<h1>2003 Ferrari 360 Spider</h1>
```

These are local proof canonicals with an explicit tenant selector. Production
canonical origins must come from verified domain mappings, not incoming Host
headers. All responses carry `X-Robots-Tag: noindex, nofollow`; the page also
has noindex metadata. There is no root home route or general API migration.

## Deliberate limits

The verifier uses live demo inventory, not fixtures; deletion/unpublishing of
the sample must fail verification. Update `POC_TEST_VEHICLE`/`POC_TEST_TENANT`
and the expected public sample assertions deliberately when choosing a new
record. Do not seed data to make the proof pass. The test must be run with
process variables if using its credential non-disclosure assertions; Node's
verifier does not load `.env.local` itself (Next loads it for the server).

This does not port the real `DetailModelViewer`/R3F, cinematic shell, template
CSS, page-builder blocks, consent system, auth or concierge implementation.
It proves direct Three/GLTF + shader integration with a server-rendered page.
There are no database writes, migrations, lead submissions, uploads or model
provider calls. Production domain trust/cache keys, complete shader/include
parity, compressed models/decoder setup, R3F React 19 compatibility, mobile
performance and Vercel's deployed function count remain phase gates in the plan.
