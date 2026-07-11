import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { readEmailProviderConfig } from "./config";
import { renderEmailTemplate } from "./render";
import { createEmailSender } from "./sender";
import { createResendTransport, type EmailTransport } from "./transport";
import type { EmailTemplate, SendEmailInput } from "./types";

type WelcomeProps = { name: string };

const welcomeTemplate: EmailTemplate<WelcomeProps> = {
  key: "welcome",
  subject: ({ name }) => `Welcome, ${name}`,
  render: ({ name }) => createElement("p", null, "Hello ", name),
};

const input = (
  overrides: Partial<SendEmailInput<WelcomeProps>> = {},
): SendEmailInput<WelcomeProps> => ({
  tenant: { id: "tenant-1", name: "Acme Motors" },
  to: "owner@example.com",
  template: welcomeTemplate,
  props: { name: "Ada" },
  idempotencyKey: "lume:tenant-1:welcome:user-1",
  ...overrides,
});

describe("email sender configuration", () => {
  it("returns a safe no-op before rendering when Resend is not configured", async () => {
    const renderer = vi.fn(async () => ({ html: "<p>Hello</p>", text: "Hello" }));
    const sender = createEmailSender({ environment: {}, renderer });
    await expect(sender(input())).resolves.toEqual({
      status: "skipped",
      reason: "not_configured",
    });
    expect(renderer).not.toHaveBeenCalled();
  });

  it("reads only complete server configuration and validates the default sender", () => {
    expect(readEmailProviderConfig({})).toBeNull();
    expect(readEmailProviderConfig({ RESEND_API_KEY: " secret " })).toEqual({
      apiKey: "secret",
      defaultFrom: "LUME <no-reply@lume.app>",
    });
    expect(readEmailProviderConfig({
      RESEND_API_KEY: "secret",
      RESEND_FROM_EMAIL: "bad\naddress@example.com",
    })).toBeNull();
  });
});

describe("email rendering and delivery", () => {
  it("renders escaped HTML plus plain text", async () => {
    const rendered = await renderEmailTemplate(welcomeTemplate, { name: "<Ada>" });
    expect(rendered.html).toContain("&lt;Ada&gt;");
    expect(rendered.text).toContain("Hello <Ada>");
  });

  it("uses the tenant sender override and sends stable provider metadata", async () => {
    const send = vi.fn(async () => ({ ok: true as const, id: "email-1" }));
    const transport: EmailTransport = { send };
    const sender = createEmailSender({
      transport,
      renderer: async () => ({ html: "<p>Hello Ada</p>", text: "Hello Ada" }),
    });
    await expect(sender(input({
      tenant: {
        id: "tenant-1",
        name: "Acme Motors",
        fromAddress: "notifications@acme.test",
        replyTo: "sales@acme.test",
      },
      tags: [{ name: "campaign", value: "welcome-v1" }],
    }))).resolves.toEqual({ status: "sent", id: "email-1", recipientCount: 1 });
    expect(send).toHaveBeenCalledWith({
      from: "\"Acme Motors\" <notifications@acme.test>",
      to: ["owner@example.com"],
      subject: "Welcome, Ada",
      html: "<p>Hello Ada</p>",
      text: "Hello Ada",
      replyTo: "sales@acme.test",
      tags: [
        { name: "tenant_id", value: "tenant-1" },
        { name: "template", value: "welcome" },
        { name: "campaign", value: "welcome-v1" },
      ],
      idempotencyKey: "lume:tenant-1:welcome:user-1",
    });
  });

  it("filters suppressed recipients and skips when all are suppressed", async () => {
    const send = vi.fn(async () => ({ ok: true as const, id: "email-1" }));
    const sender = createEmailSender({
      transport: { send },
      renderer: async () => ({ html: "<p>Hello</p>", text: "Hello" }),
      isRecipientSuppressed: async (recipient) => recipient === "blocked@example.com",
    });
    await expect(sender(input({
      to: ["Blocked Person <BLOCKED@example.com>", "allowed@example.com"],
    }))).resolves.toMatchObject({ status: "sent", recipientCount: 1 });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: ["allowed@example.com"] }));

    send.mockClear();
    await expect(sender(input({ to: "blocked@example.com" }))).resolves.toEqual({
      status: "skipped",
      reason: "suppressed",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("returns typed failures for suppression, render, and provider errors", async () => {
    const transportError = createEmailSender({
      transport: {
        send: async () => ({ ok: false, code: "rate_limit_exceeded", retryable: true }),
      },
      renderer: async () => ({ html: "<p>Hello</p>", text: "Hello" }),
    });
    await expect(transportError(input())).resolves.toEqual({
      status: "failed",
      reason: "transport_error",
      code: "rate_limit_exceeded",
      retryable: true,
    });

    const renderError = createEmailSender({
      transport: { send: vi.fn() },
      renderer: async () => {
        throw new Error("render failed");
      },
    });
    await expect(renderError(input())).resolves.toEqual({
      status: "failed",
      reason: "render_error",
      retryable: false,
    });

    const suppressionError = createEmailSender({
      transport: { send: vi.fn() },
      isRecipientSuppressed: async () => {
        throw new Error("suppression store unavailable");
      },
    });
    await expect(suppressionError(input())).resolves.toEqual({
      status: "failed",
      reason: "suppression_check_error",
      retryable: true,
    });
  });

  it("rejects invalid tenant overrides and subject injection without sending", async () => {
    const send = vi.fn();
    const sender = createEmailSender({ transport: { send } });
    await expect(sender(input({
      tenant: {
        id: "tenant-1",
        name: "Acme",
        fromAddress: "bad\nfrom@example.com",
      },
    }))).resolves.toMatchObject({
      status: "invalid",
      issues: expect.arrayContaining(["tenant"]),
    });
    const injectedTemplate = {
      ...welcomeTemplate,
      subject: () => "Welcome\r\nBcc: victim@example.com",
    };
    await expect(sender(input({ template: injectedTemplate }))).resolves.toMatchObject({
      status: "invalid",
      issues: ["subject"],
    });
    await expect(sender(input({
      idempotencyKey: "lume:another-tenant:welcome:user-1",
    }))).resolves.toMatchObject({ status: "invalid", issues: ["idempotency_key"] });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("Resend transport", () => {
  it("passes idempotency in the second SDK argument and inspects resolved errors", async () => {
    const sdkSend = vi.fn(async () => ({
      data: { id: "provider-1" },
      error: null,
      headers: null,
    }));
    const transport = createResendTransport("test-key", {
      emails: { send: sdkSend },
    });
    const message = {
      from: "LUME <no-reply@lume.app>",
      to: ["owner@example.com"],
      subject: "Welcome",
      html: "<p>Welcome</p>",
      text: "Welcome",
      tags: [{ name: "tenant_id", value: "tenant-1" }],
      idempotencyKey: "lume:tenant-1:welcome:user-1",
    };
    await expect(transport.send(message)).resolves.toEqual({ ok: true, id: "provider-1" });
    expect(sdkSend).toHaveBeenCalledWith({
      from: message.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      tags: message.tags,
    }, { idempotencyKey: message.idempotencyKey });

    const errorSdkSend = vi.fn(async () => ({
      data: null,
      error: { name: "rate_limit_exceeded" as const, message: "slow down", statusCode: 429 },
      headers: null,
    }));
    const errorTransport = createResendTransport("test-key", {
      emails: { send: errorSdkSend },
    });
    await expect(errorTransport.send(message)).resolves.toEqual({
      ok: false,
      code: "rate_limit_exceeded",
      retryable: true,
    });
  });
});
