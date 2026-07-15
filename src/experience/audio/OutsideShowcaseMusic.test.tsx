import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _reset } from "@/lib/sound/audioEngine";
import { OutsideShowcaseMusic } from "./OutsideShowcaseMusic";

vi.mock("gsap", () => ({
  default: { killTweensOf: vi.fn(), to: vi.fn() },
}));

class FakeAudio {
  static instances: FakeAudio[] = [];
  readonly src: string;
  loop = false;
  preload = "";
  volume = 1;
  paused = true;

  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  removeAttribute(): void {}
  load(): void {}
  pause(): void { this.paused = true; }
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

describe("OutsideShowcaseMusic", () => {
  it("waits for user activation and uses a lazy same-origin asset", () => {
    render(<OutsideShowcaseMusic enabled />);
    expect(FakeAudio.instances).toHaveLength(0);

    fireEvent.pointerDown(window);

    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0]).toMatchObject({
      src: "/sounds/showcase/462089__newagesoup__ethereal-woosh.wav",
      preload: "none",
      loop: true,
    });
  });
});
