/**
 * Where signup sends the user once an account exists.
 *
 * Default is /admin/onboarding, which auto-provisions a fresh tenant. When
 * the visitor arrived from an invite link (/signup?invite=<token>) they are
 * joining an EXISTING site, so provisioning must be skipped — they go back
 * to the invite to redeem it instead.
 */

/** tenant_invites.token is a url-safe random string; anything else is junk. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{8,128}$/;

export function isValidInviteToken(token: string | null | undefined): token is string {
  return typeof token === "string" && TOKEN_SHAPE.test(token);
}

export function signupNextPath(inviteToken: string | null | undefined): string {
  if (isValidInviteToken(inviteToken)) return `/invite/${inviteToken}`;
  return "/admin/onboarding";
}
