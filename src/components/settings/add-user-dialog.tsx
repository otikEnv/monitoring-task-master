"use client";

import { Eye, EyeOff, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createUserAction } from "@/app/pengaturan/pengguna/actions";
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ROLES, ROLE_LABEL, type Role } from "@/lib/access";
import { PASSWORD_MIN, type NewUserErrors } from "@/lib/users/validate";

/** Kolom password dengan tombol tampilkan/sembunyikan. */
export function PasswordField({
  id, value, onChange, error, label, disabled,
}: { id: string; value: string; onChange: (v: string) => void; error?: string; label: string; disabled?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id} type={show ? "text" : "password"} autoComplete="new-password" value={value} disabled={disabled}
          onChange={(e) => onChange(e.target.value)} className="pr-10"
          aria-invalid={error ? true : undefined} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
        />
        <Button
          type="button" variant="ghost" size="icon-sm" className="absolute top-1/2 right-1 -translate-y-1/2"
          onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
        >
          {show ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </div>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">At least {PASSWORD_MIN} characters.</p>
      {error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** Tombol "Add user" dan dialognya: email @envisions.app, password awal, dan role (bawaan Viewer). */
export function AddUserDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [errors, setErrors] = useState<NewUserErrors & { form?: string }>({});

  function reset() {
    setEmail(""); setPassword(""); setRole("viewer"); setErrors({});
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await createUserAction({ email, password, role });
      if (res.ok) {
        toast.success(`${res.email} was added as ${ROLE_LABEL[role]}. Share the initial password with them directly.`);
        setOpen(false);
        reset();
        router.refresh();
        return;
      }
      setErrors({ ...res.fieldErrors, form: res.error });
      if (!res.fieldErrors) router.refresh();
    });
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <UserPlus aria-hidden="true" /> Add user
      </Button>
      <AlertDialog open={open} onOpenChange={(o) => { if (!pending) { setOpen(o); if (!o) reset(); } }}>
        <AlertDialogContent>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <AlertDialogHeader>
              <AlertDialogTitle>Add user</AlertDialogTitle>
              <AlertDialogDescription>
                The account is active right away. The user can change the password later with Change password.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="new-user-email">Email</Label>
              <Input
                id="new-user-email" type="email" autoComplete="off" placeholder="name@envisions.app" value={email}
                disabled={pending} onChange={(e) => setEmail(e.target.value)}
                aria-invalid={errors.email ? true : undefined} aria-describedby={errors.email ? "new-user-email-error" : undefined}
              />
              {errors.email && <p id="new-user-email-error" role="alert" className="text-sm text-destructive">{errors.email}</p>}
            </div>
            <PasswordField
              id="new-user-password" label="Initial password" value={password} onChange={setPassword}
              error={errors.password} disabled={pending}
            />
            <div className="space-y-1.5">
              <Label htmlFor="new-user-role">Role</Label>
              <NativeSelect id="new-user-role" value={role} disabled={pending} onChange={(e) => setRole(e.target.value as Role)} className="w-full">
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </NativeSelect>
              {errors.role && <p role="alert" className="text-sm text-destructive">{errors.role}</p>}
            </div>
            {errors.form && <p role="alert" className="text-sm text-destructive">{errors.form}</p>}
            <AlertDialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={() => { setOpen(false); reset(); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add user"}</Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
