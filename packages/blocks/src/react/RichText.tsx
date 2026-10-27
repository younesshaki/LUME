import type { BlockComponentProps } from "./types";
import { stringProp } from "./props";

export function RichText({ block }: BlockComponentProps) {
  const body = stringProp(block, "body");
  if (!body) return null;

  return (
    <section className="contactPage__closing">
      <p>{body}</p>
    </section>
  );
}
