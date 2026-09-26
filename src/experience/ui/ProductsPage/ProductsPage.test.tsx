import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SoundProvider } from "@/lib/sound";
import { DualModeProvider } from "@/lib/DualModeContext";
import ProductsPage from "./ProductsPage";

function renderProductsPage() {
  // The site footer routes custom pages, so the page renders inside a Router,
  // as it always does in the app.
  return render(
    <MemoryRouter>
      <DualModeProvider>
        <SoundProvider>
          <ProductsPage
            onGoHome={vi.fn()}
            onSelectProduct={vi.fn()}
            onNavigateToVehicles={vi.fn()}
            onNavigateToShowcase={vi.fn()}
            onNavigateToContact={vi.fn()}
          />
        </SoundProvider>
      </DualModeProvider>
    </MemoryRouter>,
  );
}

describe("ProductsPage", () => {
  it("renders products without uploaded images as intentional placeholders", () => {
    renderProductsPage();

    expect(screen.getByText("Moet & Chandon")).toBeInTheDocument();
    expect(screen.getByText("Hermes")).toBeInTheDocument();
    expect(screen.getByText("Rolex")).toBeInTheDocument();
  });

  it("keeps every product card reachable as a button", () => {
    renderProductsPage();

    expect(screen.getAllByRole("button", { name: /lume/i }).length).toBe(7);
  });
});
