"use client";
import type { ShowcaseScene, AudioState } from "./types";
import type { StoryStore } from "./story-store";
import {
  createAudioResource,
  type AudioResource,
  type AudioClock,
} from "./audio-resource";

/** A mount-local authorization latch is NEVER restored from persisted choice.
 * Consent acceptance, scrolling, storage events and rerenders cannot mint a
 * gesture. New scene leases may continue the explicitly enabled session;
 * rejected play() requests require another explicit gesture to retry.
 */
export function createShowcaseAudioController(options: {
  store: StoryStore;
  scenes: ShowcaseScene[];
  preference: "on" | "off";
  persist: (value: "on" | "off") => void;
  create?: () => HTMLAudioElement;
  clock?: AudioClock;
}) {
  const { store, scenes } = options;
  let disposed = false,
    authorized = false,
    enabled = false,
    hidden = false;
  let preference = options.preference;
  let lease: AudioResource | null = null;
  let previous = store.getSnapshot();
  const scene = () => scenes.find((s) => s.id === store.getSnapshot().sceneId)!;
  const publish = (
    status: AudioState["status"],
    reason: AudioState["reason"] = null,
  ) =>
    store.updateAudio({
      status,
      enabled,
      preference,
      reason,
      track: scene()?.audio.track ?? null,
    });
  const stop = () => {
    const old = lease;
    lease = null;
    old?.dispose();
  };
  const reset = (reason: AudioState["reason"]) => {
    authorized = enabled = false;
    stop();
    publish("off", reason);
  };
  const failure = (
    resource: AudioResource | null,
    status: "blocked" | "unavailable",
  ) => {
    if (disposed || resource !== lease) return;
    authorized = enabled = false;
    stop();
    publish(status, status === "unavailable" ? "missing" : "gesture");
  };
  const start = (resume?: { time: number; volume: number }) => {
    const current = scene();
    if (
      disposed ||
      !authorized ||
      !enabled ||
      hidden ||
      store.getSnapshot().consent !== "accepted"
    )
      return;
    if (!current?.audio.url) {
      reset("missing");
      publish("unavailable", "missing");
      return;
    }
    let resource: AudioResource | null = null;
    try {
      resource = createAudioResource(current.audio.url, {
        create: options.create,
        clock: options.clock,
        position: resume?.time,
        volume: resume?.volume,
        failed: () => failure(resource, "unavailable"),
      });
      lease = resource;
      publish("starting");
      void resource
        .play()
        .then(() => {
          if (!disposed && resource === lease && enabled) publish("playing");
        })
        .catch((error) =>
          failure(
            resource,
            error?.name === "NotAllowedError" ? "blocked" : "unavailable",
          ),
        );
    } catch {
      resource?.dispose();
      authorized = enabled = false;
      lease = null;
      publish("unavailable", "missing");
    }
  };
  const changed = () => {
    const state = store.getSnapshot(),
      before = previous;
    previous = state;
    if (
      disposed ||
      (state.sceneId === before.sceneId &&
        state.consent === before.consent &&
        state.reduced === before.reduced)
    )
      return;
    if (state.consent !== "accepted") {
      reset("consent");
      return;
    }
    if (state.reduced && !before.reduced) {
      reset("reduced-motion");
      return;
    }
    if (state.sceneId !== before.sceneId) {
      const oldScene = scenes.find((s) => s.id === before.sceneId);
      const resume =
        oldScene?.audio.track === scene()?.audio.track
          ? lease?.position()
          : undefined;
      stop();
      if (authorized && enabled && !hidden) start(resume);
      else
        publish(
          "off",
          hidden ? "hidden" : state.reduced ? "reduced-motion" : "gesture",
        );
    } else if (!enabled)
      publish("off", state.reduced ? "reduced-motion" : "gesture");
  };
  const unsubscribe = store.subscribe(changed);
  publish(
    "off",
    previous.consent !== "accepted"
      ? "consent"
      : previous.reduced
        ? "reduced-motion"
        : "gesture",
  );
  return {
    toggle(trustedGesture: boolean) {
      if (disposed || !trustedGesture) return;
      if (enabled) {
        preference = "off";
        options.persist(preference);
        reset("gesture");
        return;
      }
      if (store.getSnapshot().consent !== "accepted") {
        reset("consent");
        return;
      }
      if (hidden) return;
      preference = "on";
      options.persist(preference);
      authorized = enabled = true;
      start();
    },
    visibility(isHidden: boolean) {
      hidden = isHidden;
      if (hidden && !disposed) reset("hidden");
      // Returning to the tab cannot silently resume media.
    },
    preference(value: "on" | "off") {
      if (disposed) return;
      preference = value;
      if (value === "off") reset("gesture");
      else
        publish(
          store.getSnapshot().audio.status,
          store.getSnapshot().audio.reason,
        );
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      authorized = enabled = false;
      stop();
      publish("off", "gesture");
    },
  };
}
export type ShowcaseAudioController = ReturnType<
  typeof createShowcaseAudioController
>;
