import { mediaUrl } from "@/config/cdn";

export function safeLink(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (
    (trimmed.startsWith("/") && !trimmed.startsWith("//")) ||
    trimmed.startsWith("#")
  ) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    return ["https:", "http:", "tel:", "mailto:"].includes(url.protocol)
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export function safeMediaSource(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : undefined;
  } catch {
    return mediaUrl(trimmed);
  }
}

export function whatsappHref(
  phone: string,
  message = "",
): string | undefined {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 18) return undefined;
  const url = new URL(`https://wa.me/${digits}`);
  if (message.trim()) url.searchParams.set("text", message.trim().slice(0, 500));
  return url.toString();
}

export function youtubeOrVimeoEmbedUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = safeVideoId(url.pathname.slice(1));
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : undefined;
    }
    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtube-nocookie.com"
    ) {
      const pathId = url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1];
      const id = safeVideoId(url.searchParams.get("v") ?? pathId ?? "");
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : undefined;
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const id = url.pathname.match(/\/(?:video\/)?(\d+)/)?.[1];
      return id ? `https://player.vimeo.com/video/${id}` : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function safeMapEmbedUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    const host = url.hostname.toLowerCase();
    return (
      host === "www.google.com" ||
      host === "maps.google.com" ||
      host.endsWith(".openstreetmap.org")
    )
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export function splitDelimitedValue(
  value: string,
): { first: string; second: string } {
  const [first = "", ...rest] = value.split("|");
  return {
    first: first.trim(),
    second: rest.join("|").trim(),
  };
}

export type ParsedStatistic = {
  value: number;
  decimalPlaces: number;
  suffix: string;
};

export function parseStatistic(value: string): ParsedStatistic {
  const [rawValue = "0", rawDecimals = "0", ...suffixParts] = value.split("|");
  const parsedValue = Number(rawValue.replace(/,/g, "").trim());
  const parsedDecimals = Number(rawDecimals.trim());
  return {
    value: Number.isFinite(parsedValue) ? parsedValue : 0,
    decimalPlaces:
      Number.isInteger(parsedDecimals) && parsedDecimals >= 0
        ? Math.min(parsedDecimals, 3)
        : 0,
    suffix: suffixParts.join("|").trim().slice(0, 16),
  };
}

export function calculateMonthlyPayment(
  price: number,
  deposit: number,
  annualRate: number,
  termMonths: number,
): number {
  const safePrice = Number.isFinite(price) ? Math.max(0, price) : 0;
  const safeDeposit = Number.isFinite(deposit) ? Math.max(0, deposit) : 0;
  const safeRate = Number.isFinite(annualRate) ? Math.max(0, annualRate) : 0;
  const safeTerm = Number.isFinite(termMonths) ? termMonths : 1;
  const principal = Math.max(0, safePrice - safeDeposit);
  const months = Math.max(1, Math.round(safeTerm));
  const monthlyRate = safeRate / 100 / 12;
  if (principal === 0) return 0;
  if (monthlyRate === 0) return principal / months;
  const factor = (1 + monthlyRate) ** months;
  return (principal * monthlyRate * factor) / (factor - 1);
}

function safeVideoId(value: string): string | undefined {
  return /^[A-Za-z0-9_-]{6,32}$/.test(value) ? value : undefined;
}
