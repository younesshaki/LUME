export {
  DEFAULT_EMAIL_FROM,
  readEmailProviderConfig,
  readResendWebhookSecret,
} from "./config";
export type { EmailEnvironment, EmailProviderConfig } from "./config";
export { renderEmailTemplate } from "./render";
export type { EmailTemplateRenderer, RenderedEmail } from "./render";
export { createEmailSender, sendEmail } from "./sender";
export type { CreateEmailSenderOptions, EmailSender } from "./sender";
export { createResendTransport } from "./transport";
export type {
  EmailTransport,
  EmailTransportMessage,
  EmailTransportResult,
} from "./transport";
export {
  normalizeResendWebhookEvent,
  verifyResendWebhook,
} from "./webhook";
export type {
  EmailSuppressionReason,
  ResendWebhookDecision,
  ResendWebhookHeaders,
  TrackedEmailEvent,
  TrackedEmailEventType,
  VerifyResendWebhookInput,
} from "./webhook";
