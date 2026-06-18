import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PageBlock } from "@lume/types";
import { Hero } from "./Hero";
import { RichText } from "./RichText";
import { StatementList } from "./StatementList";
import { PageBuilderRenderProvider } from "../renderContext";

function block(type: string, props: Record<string, unknown>): PageBlock {
  return { id: `${type}-test`, type, props };
}

describe("page-builder content blocks", () => {
  it("renders the Contact hero using editable props", () => {
    render(
      <PageBuilderRenderProvider value={{ pageSlug: "contact" }}>
        <Hero
          mode="experience"
          block={block("hero", {
            eyebrow: "Access",
            title: "Private invitation",
            subtitle: "Arrival starts before the door opens.",
          })}
        />
      </PageBuilderRenderProvider>
    );

    expect(screen.getByText("Access")).toHaveClass("contactPage__eyebrow");
    expect(screen.getByRole("heading", { name: "Private invitation" })).toHaveClass(
      "contactPage__title"
    );
    expect(screen.getByText("Arrival starts before the door opens.")).toHaveClass(
      "contactPage__lead"
    );
  });

  it("renders statement-list and rich-text Contact sections", () => {
    render(
      <PageBuilderRenderProvider value={{ pageSlug: "contact" }}>
        <StatementList
          mode="standard"
          block={block("statement-list", {
            items: [
              { label: "01", body: "First statement." },
              { label: "02", body: "Second statement." },
            ],
          })}
        />
        <RichText
          mode="standard"
          block={block("rich-text", { body: "Closing copy." })}
        />
      </PageBuilderRenderProvider>
    );

    expect(screen.getByText("First statement.")).toBeInTheDocument();
    expect(screen.getByText("Second statement.")).toBeInTheDocument();
    expect(screen.getByText("Closing copy.")).toBeInTheDocument();
  });
});
