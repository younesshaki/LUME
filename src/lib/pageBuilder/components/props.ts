import type { PageBlock } from "@lume/types";

export function stringProp(
  block: PageBlock,
  name: string,
  fallback = ""
): string {
  const value = block.props[name];
  return typeof value === "string" ? value : fallback;
}

export function booleanProp(
  block: PageBlock,
  name: string,
  fallback: boolean
): boolean {
  const value = block.props[name];
  return typeof value === "boolean" ? value : fallback;
}

export function numberProp(
  block: PageBlock,
  name: string,
  fallback = 0
): number {
  const value = block.props[name];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function stringArrayProp(block: PageBlock, name: string): string[] {
  const value = block.props[name];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export type StatementItem = {
  label: string;
  body: string;
};

export function labelBodyItemsProp(
  block: PageBlock,
  name = "items"
): StatementItem[] {
  const value = block.props[name];
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      return typeof record.label === "string" && typeof record.body === "string"
        ? { label: record.label, body: record.body }
        : null;
    })
    .filter((item): item is StatementItem => Boolean(item));
}

export function statementItemsProp(block: PageBlock): StatementItem[] {
  return labelBodyItemsProp(block);
}
