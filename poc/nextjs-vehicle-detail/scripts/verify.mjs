import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { chromium } from '@playwright/test';
import { selectTenant } from '../lib/tenant.ts';

const origin = process.env.POC_TEST_ORIGIN ?? 'http://127.0.0.1:3100';
const id = process.env.POC_TEST_VEHICLE ?? '07936ada-4478-5875-9ae4-757d51beab28';
const tenant = process.env.POC_TEST_TENANT ?? 'demo-max';
const url = `${origin}/vehicles/${id}?tenant=${tenant}`;
const artifacts = new URL('../artifacts/', import.meta.url);
await mkdir(artifacts, { recursive: true });

assert.equal(selectTenant('demo-max.lume.test', undefined, 'lume.test', 'default'), tenant);
assert.equal(selectTenant('demo-max.lume.test', 'default', 'lume.test', 'default'), null);
assert.equal(selectTenant('attacker.example', tenant, 'lume.test', 'default'), null);
assert.equal(selectTenant('www.lume.test', undefined, 'lume.test', 'default'), null);

const response = await fetch(url);
assert.equal(response.status, 200);
assert.match(response.headers.get('cache-control'), /no-store/);
assert.match(response.headers.get('x-robots-tag'), /noindex/);
const html = await response.text();
await writeFile(new URL('vehicle.html', artifacts), html);
const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
const description = html.match(/<meta name="description" content="([^"]+)"/);
const canonical = html.match(/<link rel="canonical" href="([^"]+)"/);
assert.ok(html.indexOf('<title>') < html.indexOf('</head>'), 'metadata in initial head');
assert.ok(title?.includes('Ferrari') || process.env.POC_TEST_VEHICLE, 'real vehicle title in raw HTML');
assert.ok(title?.includes('Max Auto') || process.env.POC_TEST_TENANT, 'tenant title in raw HTML');
assert.ok(description);
assert.ok(canonical?.[1].includes(id));
assert.match(html, /<h1>[^<]+<\/h1>/);
assert.doesNotMatch(html, /<canvas/);
for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'R2_SECRET_ACCESS_KEY', 'DEEPSEEK_API_KEY']) {
  if (process.env[name]) assert.ok(!html.includes(process.env[name]), `${name} must stay out of HTML`);
}
// Node fetch normalizes Host; use http.request to exercise real Host routing.
async function hostRequest(path, host) {
  return new Promise((resolve, reject) => {
    http.get(new URL(path, origin), { headers: { host } }, response => {
      let body = ''; response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, text: async () => body }));
    }).on('error', reject);
  });
}
const hostResponse = await hostRequest(`/vehicles/${id}`, `${tenant}.lume.test`);
assert.equal(hostResponse.status, 200);
assert.ok((await hostResponse.text()).includes(title));
const wrongTenant = await fetch(`${origin}/vehicles/${id}?tenant=default`);
assert.equal(wrongTenant.status, 404, 'same vehicle cannot render for a different tenant');
const conflicting = await hostRequest(`/vehicles/${id}?tenant=default`, `${tenant}.lume.test`);
assert.equal(conflicting.status, 404);
const unknown = await hostRequest(`/vehicles/${id}?tenant=${tenant}`, 'attacker.example');
assert.equal(unknown.status, 404);
console.log('PASS raw HTML title, description, canonical, h1; host/query tenant resolution; wrong tenant/host 404; no SSR canvas or keys');
console.log([`<title>${title}</title>`, description[0] + '>', canonical[0] + '>'].join('\n'));

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } } : {}) });
try {
  // Real no-JS browser, in addition to the raw fetch assertion above.
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await noJs.newPage();
  await staticPage.goto(url);
  assert.equal(await staticPage.locator('h1').count(), 1);
  assert.equal(await staticPage.title(), title);
  await noJs.close();
  console.log('PASS JavaScript-disabled browser title and h1');
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const modelRequests = [];
  page.on('request', request => { if (/\.glb(?:\?|$)/.test(request.url())) modelRequests.push(request.url()); });
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('[data-testid="vehicle-image"]')?.naturalWidth > 0);
  console.log('PASS R2 photograph decoded in Chromium');
  assert.equal(modelRequests.length, 0, 'no GLB download before interaction');
  await page.getByRole('button', { name: 'Inspect 3D proof' }).click();
  await page.getByRole('status').filter({ hasText: 'R2 model loaded' }).waitFor({ timeout: 60000 });
  assert.equal(await page.locator('canvas').count(), 1);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: new URL('viewer.png', artifacts).pathname, fullPage: true });
  assert.equal(modelRequests.length, 1);
  await page.getByRole('button', { name: 'Ask about this vehicle' }).click();
  await page.getByRole('dialog', { name: 'Vehicle chat entry' }).waitFor();
  await page.getByRole('button', { name: 'Inspect 3D proof' }).click();
  assert.equal(await page.locator('canvas').count(), 0, 'viewer unmounts');
  assert.deepEqual(errors, [], 'no hydration, WebGL shader or browser errors');
  console.log('PASS no-JS content; R2 vehicle image decoded; GLB loaded only after click; WebGL + imported GLSL rendered; chat context; canvas unmount; no browser errors');
} finally { await browser.close(); }
