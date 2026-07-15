import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _poolStats, _reset, init, play } from "./audioEngine";

type Listener = () => void;

class FakeAudio {
  static instances: FakeAudio[] = [];
  readonly src: string;
  preload = "";
  volume = 1;
  playbackRate = 1;
  currentTime = 0;
  paused = true;
  ended = false;
  private listeners = new Map<string, Set<Listener>>();

  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }
}

beforeEach(() => {
  _reset();
  FakeAudio.instances = [];
  vi.stubGlobal("Audio", FakeAudio);
});

afterEach(() => {
  _reset();
  vi.unstubAllGlobals();
});

function unlock(): void {
  init();
  window.dispatchEvent(new Event("pointerdown"));
}

describe("audioEngine lazy pools", () => {
  it("does not create or preload audio during initialization", () => {
    init();
    expect(FakeAudio.instances).toHaveLength(0);
    expect(_poolStats()).toEqual({ sources: 0, elements: 0 });
  });

  it("creates pool members only as overlapping playback needs them", () => {
    unlock();

    play("navbar.tab.click");
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].preload).toBe("none");

    play("navbar.tab.click");
    expect(FakeAudio.instances).toHaveLength(2);
  });

  it("deduplicates pools for sound keys that share a source URL", () => {
    unlock();

    play("navbar.tab.click");
    play("navbar.logo.click");

    expect(_poolStats().sources).toBe(1);
    expect(new Set(FakeAudio.instances.map((audio) => audio.src)).size).toBe(1);
  });
});
