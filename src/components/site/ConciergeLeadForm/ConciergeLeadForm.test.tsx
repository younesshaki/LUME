import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { queueConciergeTargetAction } from "@/lib/conciergeTargetRuntime";
import { ConciergeLeadForm } from "./ConciergeLeadForm";

const mocks = vi.hoisted(() => ({
  submitLead: vi.fn(),
}));

vi.mock("@/lib/leads", () => ({
  submitLead: mocks.submitLead,
}));

describe("ConciergeLeadForm", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/contact");
    mocks.submitLead.mockReset().mockResolvedValue({ leadId: "lead-1" });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("turns a queued conversion target into a real attributed lead", async () => {
    queueConciergeTargetAction({
      type: "navigate-target",
      targetKey: "contact-lead-form",
      params: { vehicleId: "vehicle-1" },
      target: {
        key: "contact-lead-form",
        label: "Contact and lead form",
        kind: "form",
        destination: "/contact#concierge-lead-form",
        isConversion: true,
      },
      attribution: {
        targetKey: "contact-lead-form",
        sessionId: "chat-1",
        conversationContext: "user: Please have someone contact me",
      },
    });

    render(<ConciergeLeadForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("First name"), "Ada");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Submit request" }));

    await waitFor(() => {
      expect(mocks.submitLead).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: "Ada",
          email: "ada@example.com",
          vehicleId: "vehicle-1",
          source: "chat",
          sourceContext: {
            trigger: "bot-action",
            actionType: "open-lead-form",
            vehicleId: "vehicle-1",
            targetKey: "contact-lead-form",
            chatSessionId: "chat-1",
            conversationContext: "user: Please have someone contact me",
          },
        }),
      );
    });
    expect(await screen.findByText(/dealership will follow up/i)).toBeVisible();
  });
});
