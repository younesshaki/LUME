# Owned Draco runtime

These unmodified decoder files come from the pinned `three@0.164.1` npm
package's `examples/jsm/libs/draco/gltf/` directory. They implement Google
Draco's glTF compression extension; see LICENSE.txt and provenance.json.
The directory identifies the distributing Three version, not an inferred
standalone Draco release number.

The showcase uses WASM explicitly and serves both files from this same-origin
path. No gstatic/CDN fallback, encoder, or JavaScript-only decoder is shipped.
Browsers without WebAssembly retain the server/unsupported-view fallback.

Upgrade the Three dependency and these two assets together; regenerate the
SHA-256/size receipt and re-run loader, cancelled decoder-init and rendering
checks. In particular re-test the instance-local `_getWorker` lifecycle guard:
Three 0.164.1 may create a worker after decoder initialization finishes even
when `dispose()` was called earlier.
