"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { resetPasswordAction, setActiveAction, setRoleAction } from "@/app/pengaturan/pengguna/actions";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROLES, ROLE_LABEL, isRole, type Role } from "@/lib/access";
import type { UserRow } from "@/lib/users/load";
import { PasswordField } from "./add-user-dialog";

/** Waktu sudah diformat di server (agar render server dan hidrasi sama). */
export type UserView = UserRow & { created: string; lastSignIn: string };

const METHOD: Record<string, string> = { email: "Password", google: "Google" };
/** Email yang boleh patah sebelum "@" (bukan di tengah kata). */
const emailText = (email: string) => {
  const at = email.indexOf("@");
  return at > 0 ? <>{email.slice(0, at)}<wbr />{email.slice(at)}</> : email;
};

const methodText = (p: string[]) => (p.length === 0 ? "-" : p.map((x) => METHOD[x] ?? x).join(", "));

type Dialog = { kind: "disable" | "reset"; user: UserView } | null;

/**
 * Tab Users: pencarian dan filter (langsung, tanpa Apply karena hanya menyaring tampilan), role per baris (langsung
 * tersimpan), Disable/Enable, dan Reset password. Baris milik sendiri terkunci.
 */
export function UsersPanel({ users, meId }: { users: UserView[]; meId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | Role>("");
  const [status, setStatus] = useState<"" | "active" | "disabled">("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [password, setPassword] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users.filter((u) =>
      (!needle || u.email.toLowerCase().includes(needle)) &&
      (!roleFilter || u.role === roleFilter) &&
      (!status || (status === "disabled") === u.disabled));
  }, [users, q, roleFilter, status]);

  function run(userId: string, fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string, after?: () => void) {
    setBusy(userId);
    start(async () => {
      const res = await fn();
      setBusy(null);
      if (!res.ok) {
        if (dialog) setDialogError(res.error);
        else toast.error(res.error);
        return;
      }
      toast.success(success);
      after?.();
      router.refresh();
    });
  }

  const closeDialog = () => { setDialog(null); setPassword(""); setDialogError(null); };

  const changeRole = (u: UserView, value: string) => {
    if (!isRole(value) || value === u.role) return;
    run(u.id, () => setRoleAction(u.id, value), `${u.email} is now ${ROLE_LABEL[value]}.`);
  };

  // Fungsi render (bukan komponen bertingkat) agar elemen tidak dipasang ulang tiap render.
  const roleSelect = (u: UserView, mine: boolean) => (
    <NativeSelect
      size="sm" className="w-32" value={u.role} disabled={mine || (pending && busy === u.id)} aria-label={`Role for ${u.email}`}
      onChange={(e) => changeRole(u, e.target.value)}
      title={mine ? "You can't change your own role." : undefined}
    >
      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
    </NativeSelect>
  );

  const statusBadge = (u: UserView) =>
    u.disabled ? <Badge variant="destructive">Disabled</Badge> : <Badge variant="secondary">Active</Badge>;

  const actions = (u: UserView, mine: boolean) =>
    mine ? (
      <span className="text-xs text-muted-foreground">-</span>
    ) : (
      <div className="flex flex-wrap gap-1.5 lg:flex-nowrap">
        {u.disabled ? (
          <Button
            type="button" variant="outline" size="sm" disabled={pending && busy === u.id}
            onClick={() => run(u.id, () => setActiveAction(u.id, true), `${u.email} can sign in again.`)}
          >
            Enable
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" disabled={pending && busy === u.id} onClick={() => setDialog({ kind: "disable", user: u })}>
            Disable
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" disabled={pending && busy === u.id} onClick={() => setDialog({ kind: "reset", user: u })}>
          Reset password
        </Button>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label htmlFor="u-search" className="text-xs text-muted-foreground">Search email</Label>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="u-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="name@envisions.app" className="pl-8" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="u-role" className="text-xs text-muted-foreground">Role</Label>
          <NativeSelect id="u-role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as "" | Role)}>
            <option value="">All roles</option>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="u-status" className="text-xs text-muted-foreground">Status</Label>
          <NativeSelect id="u-status" value={status} onChange={(e) => setStatus(e.target.value as "" | "active" | "disabled")}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </NativeSelect>
        </div>
        <p role="status" className="pb-1 text-xs text-muted-foreground">
          {shown.length === users.length ? `${users.length} users` : `${shown.length} of ${users.length} users`}
        </p>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No users match the filter.</p>
      ) : (
        <>
          {/* Desktop: tabel. */}
          <div className="hidden rounded-xl border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead scope="col">Email</TableHead>
                  <TableHead scope="col">Role</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Sign-in method</TableHead>
                  <TableHead scope="col">Created</TableHead>
                  <TableHead scope="col">Last sign-in</TableHead>
                  <TableHead scope="col"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((u) => {
                  const mine = u.id === meId;
                  return (
                    <TableRow key={u.id} className="align-middle">
                      <TableCell className="whitespace-normal break-words font-medium">
                        {emailText(u.email)}{mine && <Badge variant="outline" className="ml-2">You</Badge>}
                      </TableCell>
                      <TableCell>{roleSelect(u, mine)}</TableCell>
                      <TableCell>{statusBadge(u)}</TableCell>
                      <TableCell className="text-muted-foreground">{methodText(u.providers)}</TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">{u.created}</TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">{u.lastSignIn}</TableCell>
                      <TableCell>{actions(u, mine)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Ponsel: kartu per user. */}
          <ul className="space-y-3 md:hidden">
            {shown.map((u) => {
              const mine = u.id === meId;
              return (
                <li key={u.id} className="space-y-3 rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 break-words text-sm font-medium">
                      {emailText(u.email)}{mine && <Badge variant="outline" className="ml-2">You</Badge>}
                    </p>
                    {statusBadge(u)}
                  </div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">Sign-in</dt><dd>{methodText(u.providers)}</dd>
                    <dt className="text-muted-foreground">Created</dt><dd>{u.created}</dd>
                    <dt className="text-muted-foreground">Last sign-in</dt><dd>{u.lastSignIn}</dd>
                  </dl>
                  <div className="flex flex-wrap items-center gap-2">
                    {roleSelect(u, mine)}
                    {actions(u, mine)}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <AlertDialog open={dialog !== null} onOpenChange={(o) => { if (!o && !pending) closeDialog(); }}>
        <AlertDialogContent>
          {dialog?.kind === "disable" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Disable {dialog.user.email}?</AlertDialogTitle>
                <AlertDialogDescription>
                  They are signed out and can&apos;t sign in until enabled again. Their notes, comments, and activity
                  stay.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {dialogError && <p role="alert" className="text-sm text-destructive">{dialogError}</p>}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
                <Button
                  type="button" variant="destructive" disabled={pending}
                  onClick={() => run(dialog.user.id, () => setActiveAction(dialog.user.id, false), `${dialog.user.email} was disabled.`, closeDialog)}
                >
                  {pending ? "Disabling…" : "Disable user"}
                </Button>
              </AlertDialogFooter>
            </>
          )}
          {dialog?.kind === "reset" && (
            <form
              className="space-y-4" noValidate
              onSubmit={(e) => {
                e.preventDefault();
                run(dialog.user.id, () => resetPasswordAction(dialog.user.id, password), `Password for ${dialog.user.email} was reset.`, closeDialog);
              }}
            >
              <AlertDialogHeader>
                <AlertDialogTitle>Reset password for {dialog.user.email}</AlertDialogTitle>
                <AlertDialogDescription>
                  Share the new password with them directly. Google sign-in keeps working.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <PasswordField
                id="reset-password" label="New password" value={password} disabled={pending}
                onChange={(v) => { setPassword(v); setDialogError(null); }} error={dialogError ?? undefined}
              />
              <AlertDialogFooter>
                <Button type="button" variant="outline" disabled={pending} onClick={closeDialog}>Cancel</Button>
                <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Reset password"}</Button>
              </AlertDialogFooter>
            </form>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
