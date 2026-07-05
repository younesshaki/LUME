"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TenantInvite, TenantRole } from "@lume/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  TENANT_ROLES,
  normalizeInviteEmail,
  rowToTenantInvite,
  validateInviteEmail,
  type TeamMember,
} from "@/lib/team";

type TeamClientProps = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  currentUserId: string;
  canManage: boolean;
  initialMembers: TeamMember[];
  initialInvites: TenantInvite[];
};

type StatusState =
  | { type: "idle"; message: string }
  | { type: "saving"; message: string }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

export default function TeamClient({
  tenantId,
  tenantSlug,
  tenantName,
  currentUserId,
  canManage,
  initialMembers,
  initialInvites,
}: TeamClientProps) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [invites, setInvites] = useState(initialInvites);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TenantRole>("viewer");
  const [status, setStatus] = useState<StatusState>({ type: "idle", message: "" });
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function changeRole(member: TeamMember, role: TenantRole) {
    if (!canManage || role === member.role) return;

    setBusyKey(member.userId);
    setStatus({ type: "saving", message: "Updating member role..." });
    try {
      const { error } = await createSupabaseBrowserClient()
        .from("tenant_members")
        .update({ role })
        .eq("tenant_id", tenantId)
        .eq("user_id", member.userId);
      if (error) throw new Error(error.message);
      setMembers((current) =>
        current.map((item) => item.userId === member.userId ? { ...item, role } : item)
      );
      setStatus({ type: "success", message: "Member role updated." });
      router.refresh();
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to update member role.",
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function removeMember(member: TeamMember) {
    if (!canManage) return;
    const confirmed = window.confirm(`Remove member ${member.userId}?`);
    if (!confirmed) return;

    setBusyKey(member.userId);
    setStatus({ type: "saving", message: "Removing team member..." });
    try {
      const { error } = await createSupabaseBrowserClient()
        .from("tenant_members")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("user_id", member.userId);
      if (error) throw new Error(error.message);
      setMembers((current) => current.filter((item) => item.userId !== member.userId));
      setStatus({ type: "success", message: "Team member removed." });
      router.refresh();
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to remove member.",
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function createInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;

    const validationError = validateInviteEmail(inviteEmail);
    if (validationError) {
      setStatus({ type: "error", message: validationError });
      return;
    }

    setStatus({ type: "saving", message: "Creating invite..." });
    try {
      const { data, error } = await createSupabaseBrowserClient()
        .from("tenant_invites")
        .insert({
          tenant_id: tenantId,
          email: normalizeInviteEmail(inviteEmail),
          role: inviteRole,
          status: "pending",
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      setInvites((current) => [rowToTenantInvite(data), ...current]);
      setInviteEmail("");
      setInviteRole("viewer");
      setStatus({ type: "success", message: "Invite created." });
      router.refresh();
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to create invite.",
      });
    }
  }

  async function copyInviteLink(invite: TenantInvite) {
    const link = `${window.location.origin}/invite/${invite.token}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedInviteId(invite.id);
      setTimeout(() => setCopiedInviteId((id) => (id === invite.id ? null : id)), 2000);
    } catch {
      window.prompt("Copy this invite link:", link);
    }
  }

  async function revokeInvite(invite: TenantInvite) {
    if (!canManage) return;

    setBusyKey(invite.id);
    setStatus({ type: "saving", message: "Revoking invite..." });
    try {
      const { data, error } = await createSupabaseBrowserClient()
        .from("tenant_invites")
        .update({ status: "revoked" })
        .eq("tenant_id", tenantId)
        .eq("id", invite.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      setInvites((current) =>
        current.map((item) => item.id === invite.id ? rowToTenantInvite(data) : item)
      );
      setStatus({ type: "success", message: "Invite revoked." });
      router.refresh();
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to revoke invite.",
      });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Manage tenant members and pending invites for {tenantName}{" "}
          <code>/{tenantSlug}</code>.
        </p>
      </header>

      {!canManage && (
        <StatusBanner
          type="idle"
          message="You can view this team, but only owners and admins can manage members or invites."
        />
      )}
      {status.message && <StatusBanner type={status.type} message={status.message} />}

      <section className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
        <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Members</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
              <th className="px-4 py-3 text-left font-medium text-neutral-500">User</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-500">Role</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-500">Joined</th>
              <th className="px-4 py-3 text-right font-medium text-neutral-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr
                key={member.userId}
                className="border-b border-neutral-100 last:border-0 dark:border-neutral-800"
              >
                <td className="px-4 py-3">
                  <p className="font-mono text-xs">{member.userId}</p>
                  {member.userId === currentUserId && (
                    <p className="mt-1 text-xs text-neutral-500">Current user</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={member.role}
                    disabled={!canManage || busyKey === member.userId}
                    onChange={(event) => void changeRole(member, event.target.value as TenantRole)}
                    className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm disabled:opacity-50 dark:border-neutral-700"
                  >
                    {TENANT_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-neutral-500">{formatDate(member.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    disabled={!canManage || busyKey === member.userId}
                    onClick={() => void removeMember(member)}
                    className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <form
          onSubmit={createInvite}
          className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
        >
          <h2 className="text-sm font-semibold">Invite Member</h2>
          <label className="mt-4 block text-xs font-medium text-neutral-500">
            Email
            <input
              type="email"
              value={inviteEmail}
              disabled={!canManage}
              onChange={(event) => {
                setInviteEmail(event.target.value);
                setStatus({ type: "idle", message: "" });
              }}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm disabled:opacity-50 dark:border-neutral-700"
            />
          </label>
          <label className="mt-4 block text-xs font-medium text-neutral-500">
            Role
            <select
              value={inviteRole}
              disabled={!canManage}
              onChange={(event) => setInviteRole(event.target.value as TenantRole)}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm disabled:opacity-50 dark:border-neutral-700"
            >
              {TENANT_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={!canManage || status.type === "saving"}
            className="mt-4 w-full rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
          >
            Create Invite
          </button>
        </form>

        <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
          <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <h2 className="text-sm font-semibold">Pending Invites</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
                <th className="px-4 py-3 text-left font-medium text-neutral-500">Email</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">Role</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">Status</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-500">Expires</th>
                <th className="px-4 py-3 text-right font-medium text-neutral-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invites.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-neutral-500">
                    No invites have been created yet.
                  </td>
                </tr>
              )}
              {invites.map((invite) => (
                <tr
                  key={invite.id}
                  className="border-b border-neutral-100 last:border-0 dark:border-neutral-800"
                >
                  <td className="px-4 py-3">
                    <p>{invite.email}</p>
                    {invite.status === "pending" && (
                      <button
                        type="button"
                        className="mt-1 text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-700 dark:hover:text-neutral-300"
                        onClick={() => void copyInviteLink(invite)}
                      >
                        {copiedInviteId === invite.id ? "Link copied!" : "Copy invite link"}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{invite.role}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                      {invite.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{formatDate(invite.expiresAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={!canManage || invite.status !== "pending" || busyKey === invite.id}
                      onClick={() => void revokeInvite(invite)}
                      className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatusBanner({ type, message }: { type: StatusState["type"]; message: string }) {
  const className =
    type === "error"
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
      : type === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
        : "border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300";

  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${className}`}
      role={type === "error" ? "alert" : "status"}
    >
      {message}
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
