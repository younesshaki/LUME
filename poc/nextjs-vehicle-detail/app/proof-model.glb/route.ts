import 'server-only';

// Disposable fixed-asset proxy: R2 currently omits CORS for localhost.
// No caller-provided URL/key, no credentials, no general open proxy.
export async function GET() {
  const base = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (!base) return new Response('Model is not configured', { status: 503 });
  const key = process.env.POC_MODEL_KEY ?? 'vehicle%20images/3D%20assets/blackredbull6.optimized.glb';
  const upstream = await fetch(`${base}/${key}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!upstream.ok) return new Response('Model unavailable', { status: 502 });
  const data = await upstream.arrayBuffer();
  if (data.byteLength > 5 * 1024 * 1024) return new Response('Proof model is too large', { status: 502 });
  return new Response(data, { headers: { 'Content-Type': 'model/gltf-binary', 'Cache-Control': 'private, no-store' } });
}
