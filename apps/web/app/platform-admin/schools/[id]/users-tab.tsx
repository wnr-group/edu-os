"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InviteUserDialog } from "./invite-user-dialog";
import { EditRoleDialog } from "./edit-role-dialog";

export interface SchoolUser {
  id: string;
  roleId: string;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  is_active: boolean;
}

interface Props {
  schoolId: string;
  users: SchoolUser[];
}

const ROLE_LABELS: Record<string, string> = {
  school_admin: "Admin",
  principal: "Principal",
  teacher: "Teacher",
  student: "Student",
  parent: "Parent",
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export function UsersTab({ schoolId, users }: Props) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editRoleUser, setEditRoleUser] = useState<SchoolUser | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleToggleActive(user: SchoolUser) {
    setLoadingId(user.roleId);
    try {
      const res = await fetch(
        `/api/schools/${schoolId}/users/${user.roleId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: !user.is_active }),
        }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          (json as { error?: string }).error ?? "Failed to update user"
        );
      }
      toast.success(
        user.is_active
          ? `${user.full_name} deactivated`
          : `${user.full_name} activated`
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setLoadingId(null);
    }
  }

  async function handleRemove(user: SchoolUser) {
    const confirmed = confirm(
      `Remove ${user.full_name} from this school? This cannot be undone.`
    );
    if (!confirmed) return;

    setLoadingId(user.roleId);
    try {
      const res = await fetch(
        `/api/schools/${schoolId}/users/${user.roleId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          (json as { error?: string }).error ?? "Failed to remove user"
        );
      }
      toast.success(`${user.full_name} removed`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove user");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">
          Users ({users.length})
        </h2>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          + Invite User
        </Button>
      </div>

      {/* Table (desktop) / cards (mobile) */}
      {users.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          No users yet. Invite users to get started.
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Email</th>
                  <th className="pb-2 font-medium">Phone</th>
                  <th className="pb-2 font-medium">Role</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isLoading = loadingId === user.roleId;
                  return (
                    <tr key={user.roleId} className="border-b last:border-0">
                      <td className="py-2.5 font-medium text-gray-900">
                        {user.full_name}
                      </td>
                      <td className="py-2.5 text-gray-500">{user.email || "—"}</td>
                      <td className="py-2.5 text-gray-500">{user.phone || "—"}</td>
                      <td className="py-2.5 text-gray-700">
                        {roleLabel(user.role)}
                      </td>
                      <td className="py-2.5">
                        <Badge
                          variant={user.is_active ? "default" : "secondary"}
                        >
                          {user.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => setEditRoleUser(user)}
                            disabled={isLoading}
                          >
                            Edit Role
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => handleToggleActive(user)}
                            disabled={isLoading}
                          >
                            {user.is_active ? "Deactivate" : "Activate"}
                          </Button>
                          <Button
                            size="xs"
                            variant="destructive"
                            onClick={() => handleRemove(user)}
                            disabled={isLoading}
                          >
                            Remove
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {users.map((user) => {
              const isLoading = loadingId === user.roleId;
              return (
                <div key={user.roleId} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900">{user.full_name}</p>
                      <p className="truncate text-xs text-gray-500">{user.email || "—"}</p>
                      <p className="truncate text-xs text-gray-500">{user.phone || "—"}</p>
                      <p className="mt-1 text-xs text-gray-700">{roleLabel(user.role)}</p>
                    </div>
                    <Badge variant={user.is_active ? "default" : "secondary"} className="shrink-0">
                      {user.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button size="xs" variant="outline" onClick={() => setEditRoleUser(user)} disabled={isLoading}>
                      Edit Role
                    </Button>
                    <Button size="xs" variant="outline" onClick={() => handleToggleActive(user)} disabled={isLoading}>
                      {user.is_active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button size="xs" variant="destructive" onClick={() => handleRemove(user)} disabled={isLoading}>
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Dialogs */}
      <InviteUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        schoolId={schoolId}
      />

      {editRoleUser && (
        <EditRoleDialog
          open={!!editRoleUser}
          onOpenChange={(open: boolean) => {
            if (!open) setEditRoleUser(null);
          }}
          schoolId={schoolId}
          roleId={editRoleUser.roleId}
          userName={editRoleUser.full_name}
          currentRole={editRoleUser.role}
          onSuccess={() => {
            setEditRoleUser(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}