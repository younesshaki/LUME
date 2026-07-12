"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { TenantInvite, TenantRole } from "@lume/types";
import type { LeadAssignmentMode } from "@/lib/leadAssignment";
import type { LeadEmailSettings } from "@/lib/leadEmailPolicy";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  TENANT_ROLES,
  normalizeInviteEmail,
  rowToTenantInvite,
  validateInviteEmail,
  type TeamMember,
} from "@/lib/team";
import {
  updateLeadAssignmentMode,
  updateLeadEmailSettings,
  updateMemberSalesAvailability,
} from "./actions";

type TeamClientProps = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  currentUserId: string;
  canManage: boolean;
  initialAssignmentMode: LeadAssignmentMode;
  initialLeadEmailSettings: LeadEmailSettings;
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
  initialAssignmentMode,
  initialLeadEmailSettings,
  initialMembers,
  initialInvites,
}: TeamClientProps) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [assignmentMode, setAssignmentMode] = useState(initialAssignmentMode);
  const [leadEmailSettings, setLeadEmailSettings] = useState(initialLeadEmailSettings);
  const [invites, setInvites] = useState(initialInvites);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TenantRole>("viewer");
  const [status, setStatus] = useState<StatusState>({ type: "idle", message: "" });
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const availableSalesCount = members.filter(
    (member) => member.salesEnabled && !member.outOfOffice
  ).length;

  async function changeAssignmentMode(mode: LeadAssignmentMode) {
    if (!canManage || mode === assignmentMode) return;
    setBusyKey("assignment-mode");
    setStatus({ type: "saving", message: "Updating lead routing…" });
    try {
      const result = await updateLeadAssignmentMode(tenantSlug, mode);
      if (result.error) {
        setStatus({ type: "error", message: result.error });
      } else {
        setAssignmentMode(mode);
        setStatus({ type: "success", message: "Lead routing updated." });
        router.refresh();
      }
    } catch {
      setStatus({ type: "error", message: "Unable to update lead routing." });
    } finally {
      setBusyKey(null);
    }
  }

  async function saveLeadEmailSettings() {
    if (!canManage) return;
    setBusyKey("lead-email-settings");
    setStatus({ type: "saving", message: "Saving lead email settings…" });
    try {
      const result = await updateLeadEmailSettings(tenantSlug, leadEmailSettings);
      setStatus(result.error
        ? { type: "error", message: result.error }
        : { type: "success", message: "Lead email settings saved." });
      if (!result.error) router.refresh();
    } catch {
      setStatus({ type: "error", message: "Unable to save lead email settings." });
    } finally {
      setBusyKey(null);
    }
  }

  async function changeSalesAvailability(
    member: TeamMember,
    salesEnabled: boolean,
    outOfOffice: boolean,
  ) {
    if (!canManage) return;
    setBusyKey(`sales:${member.userId}`);
    setStatus({ type: "saving", message: "Updating sales availability…" });
    try {
      const result = await updateMemberSalesAvailability(
        tenantSlug,
        member.userId,
        salesEnabled,
        outOfOffice,
      );
      if (result.error) {
        setStatus({ type: "error", message: result.error });
      } else {
        setMembers((current) => current.map((item) =>
          item.userId === member.userId ? { ...item, salesEnabled, outOfOffice } : item
        ));
        setStatus({ type: "success", message: "Sales availability updated." });
        router.refresh();
      }
    } catch {
      setStatus({ type: "error", message: "Unable to update sales availability." });
    } finally {
      setBusyKey(null);
    }
  }

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
    setBusyKey(member.userId);
    try {
      const { error } = await createSupabaseBrowserClient()
        .from("tenant_members")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("user_id", member.userId);
      if (error) throw new Error(error.message);
      setMembers((current) => current.filter((item) => item.userId !== member.userId));
      toast.success("Team member removed");
      router.refresh();
    } catch (error) {
      toast.error("Unable to remove member", {
        description: error instanceof Error ? error.message : undefined,
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
        <p className="mt-1 text-sm text-muted-foreground">
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

      <section className="rounded-xl border p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">Lead routing</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              Round robin assigns each new lead to the next available sales-enabled member.
              Manual assignments remain available from each lead detail page.
            </p>
          </div>
          <label className="text-xs font-medium text-muted-foreground">
            Assignment mode
            <select
              value={assignmentMode}
              disabled={!canManage || busyKey === "assignment-mode"}
              onChange={(event) => void changeAssignmentMode(event.target.value as LeadAssignmentMode)}
              className="mt-1 block rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm text-foreground disabled:opacity-50 dark:border-neutral-700"
            >
              <option value="manual">Manual</option>
              <option value="round_robin">Round robin</option>
            </select>
          </label>
        </div>
        {assignmentMode === "round_robin" && availableSalesCount === 0 ? (
          <p className="mt-3 text-sm text-amber-700 dark:text-amber-400" role="status">
            No sales members are currently available; new leads will remain unassigned.
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">Lead email notifications</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              Owners are always included. Add roles, notify an unassigned pool, and choose
              immediate delivery or one hourly digest.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={leadEmailSettings.enabled}
              disabled={!canManage || busyKey === "lead-email-settings"}
              onChange={(event) => setLeadEmailSettings((current) => ({
                ...current,
                enabled: event.target.checked,
              }))}
            />
            Enabled
          </label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-xs font-medium text-muted-foreground">
            Delivery mode
            <select
              value={leadEmailSettings.mode}
              disabled={!canManage || busyKey === "lead-email-settings"}
              onChange={(event) => setLeadEmailSettings((current) => ({
                ...current,
                mode: event.target.value === "hourly" ? "hourly" : "instant",
              }))}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm text-foreground disabled:opacity-50 dark:border-neutral-700"
            >
              <option value="instant">Immediately</option>
              <option value="hourly">Hourly digest</option>
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Unassigned-pool email (optional)
            <input
              type="email"
              value={leadEmailSettings.unassignedAddress ?? ""}
              disabled={!canManage || busyKey === "lead-email-settings"}
              placeholder="sales@example.com"
              onChange={(event) => setLeadEmailSettings((current) => ({
                ...current,
                unassignedAddress: event.target.value || null,
              }))}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm text-foreground disabled:opacity-50 dark:border-neutral-700"
            />
          </label>
        </div>
        <fieldset className="mt-4" disabled={!canManage || busyKey === "lead-email-settings"}>
          <legend className="text-xs font-medium text-muted-foreground">Additional roles</legend>
          <div className="mt-2 flex flex-wrap gap-4">
            {TENANT_ROLES.map((role) => {
              const checked = role === "owner" || leadEmailSettings.roles.includes(role);
              return (
                <label key={role} className="inline-flex items-center gap-2 text-xs capitalize">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={role === "owner" || !canManage || busyKey === "lead-email-settings"}
                    onChange={(event) => setLeadEmailSettings((current) => ({
                      ...current,
                      roles: event.target.checked
                        ? [...new Set([...current.roles, role])]
                        : current.roles.filter((item) => item !== role),
                    }))}
                  />
                  {role}
                </label>
              );
            })}
          </div>
        </fieldset>
        <button
          type="button"
          disabled={!canManage || busyKey === "lead-email-settings"}
          onClick={() => void saveLeadEmailSettings()}
          className="mt-4 rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
        >
          {busyKey === "lead-email-settings" ? "Saving…" : "Save email settings"}
        </button>
      </section>

      <section className="overflow-x-auto rounded-xl border">
        <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Members</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">User</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Sales routing</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Out of office</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Joined</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr
                key={member.userId}
                className="border-b last:border-0"
              >
                <td className="px-4 py-3">
                  <p className="font-mono text-xs">{member.userId}</p>
                  {member.userId === currentUserId && (
                    <p className="mt-1 text-xs text-muted-foreground">Current user</p>
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
                <td className="px-4 py-3">
                  <label className="inline-flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={member.salesEnabled}
                      disabled={!canManage || busyKey === `sales:${member.userId}`}
                      onChange={(event) => void changeSalesAvailability(
                        member,
                        event.target.checked,
                        event.target.checked ? member.outOfOffice : false,
                      )}
                    />
                    Sales member
                  </label>
                </td>
                <td className="px-4 py-3">
                  <label className="inline-flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={member.outOfOffice}
                      disabled={
                        !canManage ||
                        !member.salesEnabled ||
                        busyKey === `sales:${member.userId}`
                      }
                      onChange={(event) => void changeSalesAvailability(
                        member,
                        member.salesEnabled,
                        event.target.checked,
                      )}
                    />
                    Away
                  </label>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(member.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <ConfirmActionDialog
                    title="Remove this team member?"
                    description={`${member.userId === currentUserId ? "This is your own membership — removing it locks you out of this site. " : ""}Member ${member.userId} loses all access to ${tenantName} immediately. They can be re-invited later.`}
                    actionLabel="Remove member"
                    onConfirm={() => void removeMember(member)}
                  >
                    <button
                      type="button"
                      disabled={!canManage || busyKey === member.userId}
                      className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30"
                    >
                      Remove
                    </button>
                  </ConfirmActionDialog>
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
          <label className="mt-4 block text-xs font-medium text-muted-foreground">
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
          <label className="mt-4 block text-xs font-medium text-muted-foreground">
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

        <div className="overflow-hidden rounded-xl border">
          <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <h2 className="text-sm font-semibold">Pending Invites</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Expires</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invites.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    No invites have been created yet.
                  </td>
                </tr>
              )}
              {invites.map((invite) => (
                <tr
                  key={invite.id}
                  className="border-b last:border-0"
                >
                  <td className="px-4 py-3">
                    <p>{invite.email}</p>
                    {invite.status === "pending" && (
                      <button
                        type="button"
                        className="mt-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                        onClick={() => void copyInviteLink(invite)}
                      >
                        {copiedInviteId === invite.id ? "Link copied!" : "Copy invite link"}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{invite.role}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                      {invite.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(invite.expiresAt)}</td>
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
