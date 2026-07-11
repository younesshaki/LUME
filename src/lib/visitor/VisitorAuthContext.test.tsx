import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VisitorAuthProvider, useVisitorAuth } from "./VisitorAuthContext";
import type { VisitorClient } from "./visitorClient";

const visitor = {
  id: "visitor-1",
  email: "guest@example.com",
  firstName: "Amina",
  lastName: "Noor",
  createdAt: "2026-07-11T00:00:00.000Z",
};

function AuthProbe() {
  const { status, visitor: currentVisitor, signup } = useVisitorAuth();

  return (
    <div>
      <span>{status}:{currentVisitor?.id ?? "none"}</span>
      <button
        type="button"
        onClick={() => {
          void signup({
            email: visitor.email,
            password: "long-enough-password",
          });
        }}
      >
        Sign up
      </button>
    </div>
  );
}

describe("VisitorAuthProvider", () => {
  it("hydrates anonymously, then signs up, logs in, and stores the visitor", async () => {
    const signup = vi.fn(async () => ({ visitorId: visitor.id }));
    const login = vi.fn(async () => visitor);
    const client: VisitorClient = {
      signup,
      login,
      logout: async () => undefined,
      getMe: async () => null,
      getLoyalty: async () => ({ points: 0, tier: null, transactions: [] }),
    };

    render(
      <VisitorAuthProvider client={client}>
        <AuthProbe />
      </VisitorAuthProvider>
    );

    await screen.findByText("anonymous:none");
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => expect(screen.getByText("authenticated:visitor-1")).toBeInTheDocument());
    expect(signup).toHaveBeenCalledWith({
      email: visitor.email,
      password: "long-enough-password",
    });
    expect(login).toHaveBeenCalledWith({
      email: visitor.email,
      password: "long-enough-password",
    });
  });
});
