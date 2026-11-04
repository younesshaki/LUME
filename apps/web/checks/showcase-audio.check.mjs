import test from "node:test";
import assert from "node:assert/strict";
import { showcaseAssets } from "../server/showcase/media.ts";
import { createStoryStore } from "../components/showcase/story-store.ts";
import { createShowcaseAudioController } from "../components/showcase/audio-controller.ts";
import {
  createAudioResource,
  BASE_AUDIO_VOLUME,
} from "../components/showcase/audio-resource.ts";

const scenes = showcaseAssets("https://preview.r2.dev").scenes;
class Media extends EventTarget {
  src = "";
  currentTime = 0;
  duration = 30;
  volume = 0;
  paused = true;
  plays = 0;
  pauses = 0;
  loads = 0;
  removed = false;
  listeners = new Set();
  addEventListener(name, callback, ...rest) {
    this.listeners.add(callback);
    super.addEventListener(name, callback, ...rest);
  }
  removeEventListener(name, callback, ...rest) {
    this.listeners.delete(callback);
    super.removeEventListener(name, callback, ...rest);
  }
  play() {
    this.plays++;
    this.paused = false;
    return this.pending ?? Promise.resolve();
  }
  pause() {
    this.pauses++;
    this.paused = true;
  }
  removeAttribute(name) {
    assert.equal(name, "src");
    this.src = "";
    this.removed = true;
  }
  load() {
    this.loads++;
  }
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
function setup({
  consent = null,
  reduced = false,
  preference = "off",
  customCreate,
} = {}) {
  const store = createStoryStore(scenes[0].id),
    media = [],
    saved = [],
    frames = new Map();
  let frameId = 0;
  const clock = {
    frame: (cb) => {
      frames.set(++frameId, cb);
      return frameId;
    },
    cancel: (id) => frames.delete(id),
    now: () => 0,
  };
  store.update({ consent, reduced });
  const player = createShowcaseAudioController({
    store,
    scenes,
    preference,
    clock,
    persist: (value) => saved.push(value),
    create: () => {
      const m = customCreate?.() ?? new Media();
      media.push(m);
      return m;
    },
  });
  return { store, media, saved, player, frames, clock };
}
function released(m) {
  assert.equal(m.paused, true);
  assert.equal(m.src, "");
  assert.equal(m.loads, 1);
  assert.equal(m.listeners.size, 0);
}

test("server audio groups mirror Vite's 1–4,5–8,9–11,12 mapping and share strict model-origin policy", () => {
  assert.deepEqual(
    scenes.map((s) => s.audio.track),
    [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4],
  );
  for (const s of scenes)
    assert.equal(
      s.audio.url,
      `https://preview.r2.dev/audio/showcase-track-${s.audio.track}.mp3`,
    );
  assert.ok(
    showcaseAssets(undefined).scenes.every((s) => s.audio.url === null),
  );
  for (const base of [
    "http://bad.test",
    "https://a:b@bad.test",
    "https://preview.r2.dev/?track=bad",
    "https://preview.r2.dev/#bad",
    "https://preview.r2.dev/\\bad",
  ])
    assert.throws(() => showcaseAssets(base));
  assert.deepEqual(
    showcaseAssets("https://preview.r2.dev", {
      audioUrl: "https://forged.test/x.mp3",
    }).scenes,
    scenes,
  );
});
test("neither consent nor a fake click nor persisted-on mints a playback gesture", async () => {
  const t = setup({ preference: "on" });
  t.player.toggle(true);
  assert.equal(t.media.length, 0);
  t.store.update({ consent: "accepted" });
  await flush();
  assert.equal(t.media.length, 0);
  t.player.toggle(false);
  assert.equal(t.media.length, 0);
  t.player.toggle(true);
  await flush();
  assert.equal(t.media.length, 1);
  assert.equal(t.media[0].plays, 1);
  assert.equal(t.store.getSnapshot().audio.status, "playing");
  t.player.dispose();
  released(t.media[0]);
  assert.equal(t.frames.size, 0);
});
test("scene exit unloads even a shared track before creating a new owned element; group change resets position", async () => {
  const t = setup({ consent: "accepted" });
  t.player.toggle(true);
  await flush();
  const first = t.media[0];
  first.currentTime = 7;
  first.volume = 0.2;
  t.store.update({ sceneId: scenes[1].id });
  await flush();
  released(first);
  const next = t.media[1];
  next.dispatchEvent(new Event("loadedmetadata"));
  assert.equal(next.currentTime, 7);
  assert.equal(next.volume, 0.2);
  assert.notEqual(first, next);
  t.store.update({ sceneId: scenes[4].id });
  await flush();
  released(next);
  assert.equal(t.media[2].currentTime, 0);
  assert.equal(t.media[2].src, scenes[4].audio.url);
  t.player.dispose();
  released(t.media[2]);
  assert.equal(t.frames.size, 0);
});
test("mute persists off, releases media and cannot be undone by consent or scene updates", async () => {
  const t = setup({ consent: "accepted" });
  t.player.toggle(true);
  await flush();
  t.player.toggle(true);
  assert.deepEqual(t.saved, ["on", "off"]);
  released(t.media[0]);
  t.store.update({ sceneId: scenes[8].id });
  assert.equal(t.media.length, 1);
  assert.equal(t.store.getSnapshot().audio.enabled, false);
  t.player.dispose();
});
test("consent revocation synchronously unloads and regrant alone never resumes", async () => {
  const t = setup({ consent: "accepted" });
  t.player.toggle(true);
  await flush();
  t.store.update({ consent: "rejected" });
  released(t.media[0]);
  t.store.update({ consent: "accepted" });
  await flush();
  assert.equal(t.media.length, 1);
  t.player.toggle(true);
  await flush();
  assert.equal(t.media.length, 2);
  t.player.dispose();
});
test("reduced motion starts off even with saved-on and toggling reduce stops an enabled session", async () => {
  const t = setup({ consent: "accepted", reduced: true, preference: "on" });
  assert.equal(t.media.length, 0);
  t.player.toggle(true);
  await flush();
  assert.equal(t.media.length, 1);
  t.store.update({ reduced: false });
  t.store.update({ reduced: true });
  released(t.media[0]);
  t.store.update({ reduced: false });
  await flush();
  assert.equal(t.media.length, 1);
  t.player.dispose();
});
test("hidden tab and cross-tab mute unload; returning/remote-on never starts playback", async () => {
  const t = setup({ consent: "accepted" });
  t.player.toggle(true);
  await flush();
  t.player.visibility(true);
  released(t.media[0]);
  t.player.visibility(false);
  t.player.preference("on");
  await flush();
  assert.equal(t.media.length, 1);
  t.player.toggle(true);
  await flush();
  t.player.preference("off");
  released(t.media[1]);
  t.player.dispose();
});
test("late play resolution after teardown cannot revive status, handlers or fade callbacks", async () => {
  let resolve;
  const t = setup({
    consent: "accepted",
    customCreate: () => {
      const m = new Media();
      m.pending = new Promise((r) => {
        resolve = r;
      });
      return m;
    },
  });
  t.player.toggle(true);
  t.player.dispose();
  resolve();
  await flush();
  released(t.media[0]);
  assert.equal(t.frames.size, 0);
  assert.equal(t.store.getSnapshot().audio.enabled, false);
  t.store.update({ sceneId: scenes[11].id });
  assert.equal(t.media.length, 1);
});
test("browser play rejection is handled visibly and unloads resources without an unhandled rejection", async () => {
  const t = setup({
    consent: "accepted",
    customCreate: () => {
      const m = new Media();
      m.pending = Promise.reject(
        Object.assign(new Error("denied"), { name: "NotAllowedError" }),
      );
      return m;
    },
  });
  t.player.toggle(true);
  await flush();
  released(t.media[0]);
  assert.equal(t.store.getSnapshot().audio.status, "blocked");
  assert.equal(t.frames.size, 0);
  t.player.dispose();
});
test("failed media response releases current resource; stale media errors cannot stop its replacement", async () => {
  const t = setup({ consent: "accepted" });
  t.player.toggle(true);
  await flush();
  const first = t.media[0];
  t.store.update({ sceneId: scenes[1].id });
  await flush();
  first.dispatchEvent(new Event("error"));
  assert.equal(t.store.getSnapshot().audio.enabled, true);
  t.media[1].dispatchEvent(new Event("error"));
  released(t.media[1]);
  assert.equal(t.store.getSnapshot().audio.status, "unavailable");
  t.player.dispose();
});
test("nominal five-second fade is bounded and teardown cancels its callback", async () => {
  const t = setup({ consent: "accepted" });
  t.player.toggle(true);
  await flush();
  let [id, cb] = t.frames.entries().next().value;
  t.frames.delete(id);
  cb(2500);
  assert.equal(t.media[0].volume, BASE_AUDIO_VOLUME * 0.875);
  [id, cb] = t.frames.entries().next().value;
  t.frames.delete(id);
  cb(5000);
  assert.equal(t.media[0].volume, BASE_AUDIO_VOLUME);
  assert.equal(t.frames.size, 0);
  t.player.dispose();
});
test("missing configured audio never constructs an element", () => {
  const store = createStoryStore(scenes[0].id);
  store.update({ consent: "accepted", reduced: false });
  let created = 0;
  const player = createShowcaseAudioController({
    store,
    scenes: showcaseAssets(undefined).scenes,
    preference: "off",
    persist: () => {},
    create: () => {
      created++;
      return new Media();
    },
  });
  player.toggle(true);
  assert.equal(created, 0);
  assert.equal(store.getSnapshot().audio.status, "unavailable");
  player.dispose();
});

test("audio choice is tenant-scoped and blocked preference storage defaults off without throwing", async () => {
  const { audioPreferenceKey, readAudioPreference, writeAudioPreference } =
    await import("../components/showcase/audio-preference.ts");
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage"),
    values = new Map();
  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k) => values.get(k) ?? null,
        setItem: (k, v) => values.set(k, v),
      },
    });
    writeAudioPreference("tenant-a", "on");
    assert.equal(readAudioPreference("tenant-a"), "on");
    assert.equal(readAudioPreference("tenant-b"), "off");
    assert.notEqual(
      audioPreferenceKey("tenant-a"),
      audioPreferenceKey("tenant-b"),
    );
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("Storage unavailable");
      },
    });
    assert.equal(readAudioPreference("tenant-a"), "off");
    assert.doesNotThrow(() => writeAudioPreference("tenant-a", "off"));
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});
