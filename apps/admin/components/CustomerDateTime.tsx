"use client";

import { useEffect, useState } from "react";

type FormatOptions = {
  locale?: string;
  timeZone?: string;
};

export function formatCustomerDateTime(value: string, options: FormatOptions = {}): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(options.locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  }).format(date);
}

export function normalizedDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

/**
 * Emits deterministic UTC text for SSR/hydration, then switches to the
 * viewer's local date and time after mount. Both forms include hour/minute.
 */
export function CustomerDateTime({ value, className }: { value: string; className?: string }) {
  const [label, setLabel] = useState(() => formatCustomerDateTime(value, { locale: "en", timeZone: "UTC" }));

  useEffect(() => {
    setLabel(formatCustomerDateTime(value));
  }, [value]);

  return <time className={className} dateTime={normalizedDateTime(value)}>{label}</time>;
}
