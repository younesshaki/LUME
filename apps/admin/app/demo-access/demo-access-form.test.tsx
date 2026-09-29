/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoAccessForm } from "./demo-access-form";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  signInWithPassword: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("../../lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({ auth: { signInWithPassword: mocks.signInWithPassword } }),
}));

vi.mock("../../components/ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => <button {...props}>{children}</button>,
}));

vi.mock("../../components/ui/input", () => ({
  Input: (props: React.ComponentProps<"input">) => <input {...props} />,
}));

vi.mock("../../components/ui/label", () => ({
  Label: ({ children, ...props }: React.ComponentProps<"label">) => <label {...props}>{children}</label>,
}));

afterEach(() => {
  mocks.push.mockReset();
  mocks.refresh.mockReset();
  mocks.signInWithPassword.mockReset();
});

describe("DemoAccessForm", () => {
  it("uses Sean's existing email internally and opens only his dashboard", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: null });
    render(<DemoAccessForm />);

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "sean" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "demo-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "sean@demo.lume.app",
      password: "demo-password",
    }));
    expect(mocks.push).toHaveBeenCalledWith("/admin/demo-sean");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("uses one generic error for an unknown username or rejected password", async () => {
    render(<DemoAccessForm />);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "unknown" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "anything" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Invalid username or password.");
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();

    mocks.signInWithPassword.mockResolvedValue({ error: new Error("Invalid login credentials") });
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "max" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("Invalid username or password.");
    });
  });
});
