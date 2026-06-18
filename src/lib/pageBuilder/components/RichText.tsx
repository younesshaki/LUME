import type { BlockComponentProps } from "../registry";
import { stringProp } from "./props";
import "@/experience/ui/ContactPage/ContactPage.css";

export function RichText({ block }: BlockComponentProps) {
  const body = stringProp(block, "body");
  if (!body) return null;

  return (
    <section className="contactPage__closing">
      <p>{body}</p>
    </section>
  );
}
