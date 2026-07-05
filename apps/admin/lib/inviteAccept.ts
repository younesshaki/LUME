/**
 * Invite redemption (onboarding-backlog item 3, accept half).
 *
 * Invites are created by the team admin surface (tenant_invites, RLS
 * member-read only). The invitee is NOT a member yet, so redemption runs
 * through a trusted server path with the service client — gated by the
 * invitee's authenticated session and the checks in validateInviteForUser.
 */
import type { TenantRole } from "@lume/types";

export type RedeemableInvite = {
  id: string;
  tenant_id: string;
  email: string;
  role: TenantRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
};

/**
 * Why redemption may be refused, or null when the invite is redeemable.
 * Pure — used by both the page render and the accept action.
 */
export function validateInviteForUser(
  invite: RedeemableInvite,
  userEmail: string | null | undefined,
  now: Date = new Date()
): string | null {
  if (invite.status === "accepted") return "This invite has already been used.";
  if (invite.status !== "pending") return "This invite is no longer valid.";
  if (new Date(invite.expires_at).getTime() <= now.getTime()) {
    return "This invite has expired. Ask a team admin to send a new one.";
  }
  if (!userEmail || userEmail.trim().toLowerCase() !== invite.email.toLowerCase()) {
    return `This invite was issued to ${invite.email}. Sign in with that email to accept it.`;
  }
  return null;
}
