import { describe, expect, it } from "vitest";
import { parseFeedRunCommandReceipt, parseLeadStatusCommandReceipt } from "./adminConciergeCommandReceipt";

describe("admin concierge command receipts", () => {
  it("accepts only a complete verified lead-status receipt", () => {
    expect(parseLeadStatusCommandReceipt({
      status: "executed",
      leadId: "lead-1",
      previousStatus: "new",
      nextStatus: "qualified",
    })).toEqual({
      ok: true,
      alreadyExecuted: false,
      leadId: "lead-1",
      previousStatus: "new",
      nextStatus: "qualified",
    });
  });

  it("preserves idempotent confirmations without accepting malformed data", () => {
    expect(parseLeadStatusCommandReceipt({
      status: "executed",
      leadId: "lead-1",
      previousStatus: "new",
      nextStatus: "qualified",
      alreadyExecuted: true,
    }).ok).toBe(true);
    expect(parseLeadStatusCommandReceipt({ status: "executed", leadId: "lead-1" })).toEqual({
      ok: false,
      reason: "unavailable",
      error: "Command could not be completed.",
    });
  });

  it("keeps terminal failure states explicit", () => {
    expect(parseLeadStatusCommandReceipt({ status: "expired", error: "Confirmation window expired." })).toEqual({
      ok: false,
      reason: "expired",
      error: "Confirmation window expired.",
    });
  });

  it("fails closed when the record changed after the reviewed preview", () => {
    expect(parseLeadStatusCommandReceipt({
      status: "stale",
      error: "The lead changed after this command was reviewed. Refresh and prepare a new command.",
    })).toEqual({
      ok: false,
      reason: "stale",
      error: "The lead changed after this command was reviewed. Refresh and prepare a new command.",
    });
  });
});

describe("admin concierge feed-run command receipts", () => {
  it("accepts only a complete queue receipt", () => {
    expect(parseFeedRunCommandReceipt({
      status: "queued",
      feedSourceId: "source-1",
      feedName: "Nightly inventory",
      runId: "run-1",
    })).toEqual({
      ok: true,
      alreadyExecuted: false,
      feedSourceId: "source-1",
      feedName: "Nightly inventory",
      runId: "run-1",
    });
  });

  it("does not turn a malformed queue result into a success claim", () => {
    expect(parseFeedRunCommandReceipt({ status: "queued", feedSourceId: "source-1" })).toEqual({
      ok: false,
      reason: "unavailable",
      error: "Command could not be completed.",
    });
  });
});
