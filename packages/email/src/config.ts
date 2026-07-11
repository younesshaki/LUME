import { normalizeMailbox } from "./validation";

export const DEFAULT_EMAIL_FROM = "LUME <no-reply@lume.app>";

export type EmailEnvironment = Partial<Record<
  "RESEND_API_KEY" | "RESEND_FROM_EMAIL" | "RESEND_WEBHOOK_SECRET",
  string
>>;

export type EmailProviderConfig = {
  apiKey: string;
  defaultFrom: string;
};

export function readEmailProviderConfig(
  environment: EmailEnvironment = processEmailEnvironment(),
): EmailProviderConfig | null {
  const apiKey = environment.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  const configuredFrom = environment.RESEND_FROM_EMAIL?.trim();
  const defaultFrom = configuredFrom ? normalizeMailbox(configuredFrom) : DEFAULT_EMAIL_FROM;
  if (!defaultFrom) return null;
  return { apiKey, defaultFrom };
}

export function readResendWebhookSecret(
  environment: EmailEnvironment = processEmailEnvironment(),
): string | null {
  const secret = environment.RESEND_WEBHOOK_SECRET?.trim();
  return secret && secret.length <= 512 ? secret : null;
}

function processEmailEnvironment(): EmailEnvironment {
  return {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
  };
}
