import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { botActionBus } from "./botActionBus";
import { LeadCaptureBridge } from "./LeadCaptureBridge";

const mocks = vi.hoisted(() => ({
  submitLead: vi.fn(),
}));

vi.mock("./leads", () => ({
  submitLead: mocks.submitLead,
}));

describe("LeadCaptureBridge", () => {
  beforeEach(() => {
    botActionBus.clear();
    mocks.submitLead.mockReset().mockResolvedValue({ leadId: "lead-1" });
  });

  it("submits a real tenant API lead with trusted action attribution", async () => {
    render(<LeadCaptureBridge />);
    botActionBus.publish({
      type: "capture_lead",
      contact: {
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        message: "Interested in this vehicle",
      },
      vehicleId: "vehicle-1",
      attribution: {
        targetKey: "vehicle-inquiry",
        sessionId: "chat-1",
        conversationContext: "user: I would like a call",
      },
    });

    await waitFor(() => {
      expect(mocks.submitLead).toHaveBeenCalledWith({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        message: "Interested in this vehicle",
        vehicleId: "vehicle-1",
        source: "chat",
        sourceContext: {
          trigger: "bot-action",
          actionType: "capture_lead",
          vehicleId: "vehicle-1",
          targetKey: "vehicle-inquiry",
          chatSessionId: "chat-1",
          conversationContext: "user: I would like a call",
        },
      });
    });
    expect(
      await screen.findByText("Your details were sent to the dealership."),
    ).toBeVisible();
  });
});
