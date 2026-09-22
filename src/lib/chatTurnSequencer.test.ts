import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatTurnSequencer, newChatRequestId } from "./chatTurnSequencer";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("newChatRequestId", () => {
  it("produces a distinct opaque id per call", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newChatRequestId()));
    expect(ids.size).toBe(200);
  });

  it("produces a shape the server will accept", () => {
    // The route ignores anything that is not this exact shape and falls back
    // to its own id, which would silently disable retry dedupe.
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(newChatRequestId()).toMatch(uuid);
  });

  it("still produces a valid id where crypto.randomUUID is unavailable", () => {
    // Older browsers and some embedded webviews. Falling back to something
    // malformed would quietly cost retry dedupe on exactly those clients.
    vi.stubGlobal("crypto", {});
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(newChatRequestId()).toMatch(uuid);
  });
});

describe("chat turn sequencer", () => {
  it("lets the current turn act", () => {
    const sequencer = createChatTurnSequencer();
    sequencer.begin("turn-1");
    expect(sequencer.isAuthoritative("turn-1")).toBe(true);
  });

  it("refuses a turn that never began", () => {
    // Fail closed: an action arriving with no turn in progress is not current
    // by definition.
    const sequencer = createChatTurnSequencer();
    expect(sequencer.isAuthoritative("turn-1")).toBe(false);
  });

  it("supersedes the previous turn when a newer one begins", () => {
    const sequencer = createChatTurnSequencer();
    sequencer.begin("turn-1");
    sequencer.begin("turn-2");
    expect(sequencer.isAuthoritative("turn-1")).toBe(false);
    expect(sequencer.isAuthoritative("turn-2")).toBe(true);
  });

  it("revokes an abandoned turn", () => {
    // The abort case: the fetch is cancelled but a buffered action can still
    // surface from the generator afterwards.
    const sequencer = createChatTurnSequencer();
    sequencer.begin("turn-1");
    sequencer.abandon("turn-1");
    expect(sequencer.isAuthoritative("turn-1")).toBe(false);
  });

  it("ignores a late abandon from a turn that was already superseded", () => {
    // An old turn's cleanup running after a new turn started must not silence
    // the new turn — that would be the bug in reverse.
    const sequencer = createChatTurnSequencer();
    sequencer.begin("turn-1");
    sequencer.begin("turn-2");
    sequencer.abandon("turn-1");
    expect(sequencer.isAuthoritative("turn-2")).toBe(true);
    expect(sequencer.activeTurnId).toBe("turn-2");
  });

  it("can restart after an abandon", () => {
    const sequencer = createChatTurnSequencer();
    sequencer.begin("turn-1");
    sequencer.abandon("turn-1");
    sequencer.begin("turn-2");
    expect(sequencer.isAuthoritative("turn-2")).toBe(true);
  });

  it("keeps separate instances independent", () => {
    // One sequencer per chat surface; two tabs are two JS contexts and must
    // not be able to affect one another.
    const a = createChatTurnSequencer();
    const b = createChatTurnSequencer();
    a.begin("turn-a");
    b.begin("turn-b");
    expect(a.isAuthoritative("turn-a")).toBe(true);
    expect(b.isAuthoritative("turn-b")).toBe(true);
    expect(a.isAuthoritative("turn-b")).toBe(false);
  });
});
