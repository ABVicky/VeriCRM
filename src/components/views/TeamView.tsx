"use client";

import React, { useEffect, useState } from "react";
import { useStore, UserProfile } from "@/store/useStore";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";

export const TeamView: React.FC = () => {
  const { user, clients } = useStore();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const token = await (await import("@/lib/firebase")).auth.currentUser?.getIdToken();
      if (!token) return;

      const response = await fetch("/api/staff", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to load staff list");
      }

      const data = await response.json();
      setUsers(data);
    } catch (error) {
      console.error(error);
      toast("Error loading staff data", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "super_admin") {
      fetchUsers();
    }
  }, [user]);

  const handleRoleChange = async (targetUid: string, newRole: string, currentClientIds: string[]) => {
    setUpdatingUid(targetUid);
    try {
      const token = await (await import("@/lib/firebase")).auth.currentUser?.getIdToken();
      if (!token) return;

      const response = await fetch("/api/staff", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetUid,
          role: newRole,
          clientIds: currentClientIds,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update user privileges");
      }

      toast("User role updated successfully!", "success");
      fetchUsers();
    } catch (error) {
      console.error(error);
      toast("Failed to update user role", "error");
    } finally {
      setUpdatingUid(null);
    }
  };

  const handleClientToggle = async (targetUid: string, currentRole: string, currentClientIds: string[], clientId: string) => {
    let updatedClientIds = [...currentClientIds];
    if (updatedClientIds.includes(clientId)) {
      updatedClientIds = updatedClientIds.filter((id) => id !== clientId);
    } else {
      updatedClientIds.push(clientId);
    }

    setUpdatingUid(targetUid);
    try {
      const token = await (await import("@/lib/firebase")).auth.currentUser?.getIdToken();
      if (!token) return;

      const response = await fetch("/api/staff", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetUid,
          role: currentRole,
          clientIds: updatedClientIds,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update store assignments");
      }

      toast("Store assignments synchronized!", "success");
      fetchUsers();
    } catch (error) {
      console.error(error);
      toast("Failed to update store assignments", "error");
    } finally {
      setUpdatingUid(null);
    }
  };

  if (user?.role !== "super_admin") {
    return (
      <div className="glass-panel p-8 rounded-xl border border-border text-center space-y-3">
        <div className="h-12 w-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m0 0v3m0-3h3m-3 0H9m12-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-base font-bold text-foreground">Access Restricted</h3>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          Only Super Admins can configure roles, modify staff lists, or assign clients. Please contact your administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-foreground">Team Management</h2>
          <p className="text-xs text-muted-foreground">
            Configure system access roles and restrict staff/client viewer store visibility.
          </p>
        </div>
        <Button onClick={fetchUsers} variant="outline" size="sm">
          Refresh List
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-sm text-muted-foreground animate-pulse uppercase tracking-wider font-semibold">
          Retrieving user list...
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                <th className="p-4 font-bold text-foreground/80">User Email</th>
                <th className="p-4 font-bold text-foreground/80">Role privileges</th>
                <th className="p-4 font-bold text-foreground/80">Assigned Brand Access</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.uid} className="hover:bg-accent/20 transition-colors">
                  <td className="p-4 font-medium text-foreground">
                    <div>{u.displayName || "Active User"}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </td>
                  <td className="p-4">
                    <Select
                      options={[
                        { value: "super_admin", label: "Super Admin (Full)" },
                        { value: "staff", label: "Staff (Order Management)" },
                        { value: "client_viewer", label: "Client Viewer (Read Only)" },
                      ]}
                      value={u.role}
                      disabled={updatingUid === u.uid}
                      onChange={(e) => handleRoleChange(u.uid, e.target.value, u.clientIds || [])}
                      className="max-w-[220px]"
                    />
                  </td>
                  <td className="p-4">
                    {u.role === "super_admin" ? (
                      <Badge variant="success">All Stores (Super Admin)</Badge>
                    ) : (
                      <div className="flex flex-wrap gap-2 max-w-md">
                        {clients.map((c) => {
                          const isAssigned = (u.clientIds || []).includes(c.id);
                          return (
                            <button
                              key={c.id}
                              disabled={updatingUid === u.uid}
                              onClick={() =>
                                handleClientToggle(u.uid, u.role, u.clientIds || [], c.id)
                              }
                              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                                isAssigned
                                  ? "bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
                                  : "bg-secondary hover:bg-accent border-border text-foreground/60"
                              }`}
                            >
                              {c.name}
                            </button>
                          );
                        })}
                        {clients.length === 0 && (
                          <span className="text-xs text-muted-foreground">
                            Configure at least one store client first.
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
