import { fileURLToPath } from 'node:url';

export default {
  outputFileTracingRoot: fileURLToPath(new URL('.', import.meta.url)),
  // Explicitly test webpack's asset/source alternative to vite-plugin-glsl.
  webpack(config) {
    config.module.rules.push({ test: /\.glsl$/, type: 'asset/source' });
    return config;
  },
  // Make metadata part of the initial <head> for every user agent in this proof.
  htmlLimitedBots: /.*/,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      { key: 'Cache-Control', value: 'private, no-store' }
    ] }];
  }
};
