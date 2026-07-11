import { normalizeMailbox } from "./validation";

export const DEFAULT_EMAIL_FROM = "LUME <no-reply@lume.app>";

export type EmailEnvironment = Partial<Record<
  "RESEND_API_KEY" | "RESEND_FROM_EMAIL",
  string
>>;

export type EmailProviderConfig = {
  apiKey: string;
  defaultFrom: string;
};

export function readEmailProviderConfig(
  environment: EmailEnvironment = process.env,
): EmailProviderConfig | null {
  const apiKey = environment.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  const configuredFrom = environment.RESEND_FROM_EMAIL?.trim();
  const defaultFrom = configuredFrom ? normalizeMailbox(configuredFrom) : DEFAULT_EMAIL_FROM;
  if (!defaultFrom) return null;
  return { apiKey, defaultFrom };
}
