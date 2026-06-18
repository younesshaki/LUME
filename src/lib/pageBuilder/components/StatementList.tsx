import type { BlockComponentProps } from "../registry";
import { statementItemsProp } from "./props";
import "@/experience/ui/ContactPage/ContactPage.css";

export function StatementList({ block }: BlockComponentProps) {
  const items = statementItemsProp(block);
  if (items.length === 0) return null;

  return (
    <section className="contactPage__body" aria-label="Page statements">
      {items.map((item, index) => (
        <div className="contactPage__statement" key={`${item.label}-${index}`}>
          <span>{item.label}</span>
          <p>{item.body}</p>
        </div>
      ))}
    </section>
  );
}
