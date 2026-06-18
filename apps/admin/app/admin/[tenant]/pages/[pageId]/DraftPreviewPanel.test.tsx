import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { listEditorBlockDescriptors } from "@lume/blocks";
import type { PageBlock } from "@lume/types";
import { DraftPreviewPanel } from "./DraftPreviewPanel";

function renderPreview(blocks: PageBlock[]) {
  return render(
    <DraftPreviewPanel
      pageSlug="contact"
      pageTitle="Contact"
      blocks={blocks}
      blockDescriptors={listEditorBlockDescriptors()}
    />
  );
}

describe("DraftPreviewPanel", () => {
  it("renders draft hero props from editor state", () => {
    renderPreview([
      {
        id: "hero-1",
        type: "hero",
        props: {
          eyebrow: "Private access",
          title: "Preview the draft",
          subtitle: "This is not public yet.",
          primaryCtaLabel: "Request invite",
          primaryCtaHref: "/contact",
          secondaryCtaLabel: "",
          secondaryCtaHref: "",
          backgroundImageKey: "",
          mediaUrl: "",
          alignment: "center",
        },
      },
    ]);

    expect(screen.getByText("Live Draft Preview")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Preview the draft" })).toBeTruthy();
    expect(screen.getByText("Request invite")).toBeTruthy();
  });

  it("surfaces validation errors instead of pretending invalid blocks will render", () => {
    renderPreview([{ id: "unknown-1", type: "unknown", props: {} }]);

    expect(screen.getByText('unknown block type "unknown"')).toBeTruthy();
  });
});
