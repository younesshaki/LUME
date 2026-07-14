import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import VehicleGallery from "./VehicleGallery";
import type { VehicleGalleryImage } from "@/experience/vehicles/catalog";

const images: VehicleGalleryImage[] = [
  { src: "https://cdn/a.webp", alt: "Front", isPrimary: true },
  { src: "https://cdn/b.webp", isPrimary: false },
  { src: "https://cdn/c.webp", isPrimary: false },
];

function main() {
  return screen.getByRole("img", { name: /photo|Front/i }) as HTMLImageElement;
}

describe("VehicleGallery", () => {
  it("shows the primary image first with its alt and a counter", () => {
    render(<VehicleGallery images={images} title="2022 BMW X5" />);
    expect(main().src).toContain("a.webp");
    expect(main()).toHaveAttribute("alt", "Front");
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("advances with the next arrow and wraps around", async () => {
    const user = userEvent.setup();
    render(<VehicleGallery images={images} title="2022 BMW X5" />);
    await user.click(screen.getByRole("button", { name: "Next photo" }));
    expect(main().src).toContain("b.webp");
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous photo" }));
    await user.click(screen.getByRole("button", { name: "Previous photo" }));
    expect(main().src).toContain("c.webp");
  });

  it("selects an image from the thumbnails", async () => {
    const user = userEvent.setup();
    render(<VehicleGallery images={images} title="2022 BMW X5" />);
    await user.click(screen.getByRole("button", { name: "Show photo 3" }));
    expect(main().src).toContain("c.webp");
  });

  it("navigates with the arrow keys when the stage is focused", async () => {
    const user = userEvent.setup();
    render(<VehicleGallery images={images} title="2022 BMW X5" />);
    screen.getByRole("group", { name: /photos/i }).focus();
    await user.keyboard("{ArrowRight}");
    expect(main().src).toContain("b.webp");
  });

  it("opens an accessible lightbox and closes it with Escape", async () => {
    const user = userEvent.setup();
    render(<VehicleGallery images={images} title="2022 BMW X5" />);
    await user.click(screen.getByRole("button", { name: "View photo full screen" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("button", { name: "Close photo viewer" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("hides navigation chrome for a single image", () => {
    render(<VehicleGallery images={[images[0]]} title="2022 BMW X5" />);
    expect(screen.queryByRole("button", { name: "Next photo" })).not.toBeInTheDocument();
    expect(screen.queryByText("1 / 1")).not.toBeInTheDocument();
  });
});
