import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OutsideShowcaseMusic } from "./OutsideShowcaseMusic";

class FakeAudio {
  static instances: FakeAudio[] = [];

  constructor() {
    FakeAudio.instances.push(this);
  }
}

beforeEach(() => {
  FakeAudio.instances = [];
  vi.stubGlobal("Audio", FakeAudio);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OutsideShowcaseMusic", () => {
  it("does not start the short placeholder sound as ambient music", () => {
    render(<OutsideShowcaseMusic enabled />);

    fireEvent.pointerDown(window);
    fireEvent.keyDown(window, { key: "Enter" });

    expect(FakeAudio.instances).toHaveLength(0);
  });
});
