// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  NO_ACTION_TRUTHFUL_REPLY,
  claimsCompletedSiteAction,
  truthfulReplyForEmittedActions,
} from "./chatActionClaims";

describe("claimsCompletedSiteAction", () => {
  it.each([
    "Done — I’ve sent you back.",
    "Done - I've sent you back.",
    "I have taken you to the inventory.",
    "Taking you there now.",
    "Sending you back to the results.",
    "I've opened the vehicle page for you.",
    "I pulled up the comparison page.",
    "I've applied the filters.",
    "I have updated your filters to SUVs.",
    "I've scrolled down to the finance section.",
    "You're now back on the results page.",
  ])("flags %j", (text) => {
    expect(claimsCompletedSiteAction(text)).toBe(true);
  });

  it.each([
    // Textual answers that list or describe are not site actions.
    "We have 3 BMWs under $50k: a 2021 X3, a 2020 X5 and a 2019 330i.",
    "The X5 has a 3.0L engine and all-wheel drive.",
    "I can take you to the finance page if you'd like.",
    "Would you like me to open the inventory?",
    "Our showroom is open until six.",
    "You can go back using the menu at the top.",
  ])("does not flag %j", (text) => {
    expect(claimsCompletedSiteAction(text)).toBe(false);
  });
});

describe("truthfulReplyForEmittedActions", () => {
  it("replaces the confirmed production failure when no action was emitted", () => {
    expect(truthfulReplyForEmittedActions("Done — I’ve sent you back.", 0)).toEqual({
      text: NO_ACTION_TRUTHFUL_REPLY,
      replaced: true,
    });
  });

  it("keeps a claim that an emitted action backs up", () => {
    expect(truthfulReplyForEmittedActions("Taking you there now.", 1)).toEqual({
      text: "Taking you there now.",
      replaced: false,
    });
  });

  it("keeps ordinary prose untouched", () => {
    const text = "The Cayenne is available in grey.";
    expect(truthfulReplyForEmittedActions(text, 0)).toEqual({ text, replaced: false });
  });

  it("the replacement itself makes no success claim", () => {
    expect(claimsCompletedSiteAction(NO_ACTION_TRUTHFUL_REPLY)).toBe(false);
  });
});
