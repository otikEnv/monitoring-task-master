"use client";

import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveMenuAccessAction } from "@/app/pengaturan/pengguna/actions";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MATRIX_ROLES, MENUS, ROLE_LABEL, menuLock, type MatrixRole, type MenuKey } from "@/lib/access";

export type MenuAccessValue = Record<MatrixRole, MenuKey[]>;

const same = (a: MenuKey[], b: MenuKey[]) => a.length === b.length && a.every((m) => b.includes(m));

/**
 * Tab Menu access: matriks menu × role. Perubahan baru disimpan setelah Save (pola sama dengan Apply di filter).
 * Sel terkunci tampil redup dengan alasan. Superadmin selalu bisa membuka semua menu, jadi tidak ada kolomnya.
 */
export function MenuAccessForm({ initial }: { initial: MenuAccessValue }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<MenuAccessValue>(initial);
  const [error, setError] = useState<string | null>(null);
  const changedRoles = MATRIX_ROLES.filter((r) => !same(draft[r], initial[r]));
  const dirty = changedRoles.length > 0;

  const toggle = (role: MatrixRole, menu: MenuKey, on: boolean) => {
    setError(null);
    setDraft((d) => ({ ...d, [role]: on ? [...d[role], menu] : d[role].filter((m) => m !== menu) }));
  };

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await saveMenuAccessAction(Object.fromEntries(changedRoles.map((r) => [r, draft[r]])));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Menu access saved.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Choose which menus each role can open. A menu that is off disappears from the sidebar and its pages send people
        to the Dashboard. Superadmin can always open every menu.
      </p>
      <div className="rounded-xl border bg-card">
        <Table className="min-w-[28rem]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead scope="col">Menu</TableHead>
              {MATRIX_ROLES.map((r) => <TableHead key={r} scope="col" className="text-center">{ROLE_LABEL[r]}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {MENUS.map((m) => (
              <TableRow key={m.key}>
                <TableHead scope="row" className="font-medium text-foreground">{m.label}</TableHead>
                {MATRIX_ROLES.map((r) => {
                  const lock = menuLock(r, m.key);
                  const id = `ma-${r}-${m.key}`;
                  const label = `${m.label} for ${ROLE_LABEL[r]}`;
                  return (
                    <TableCell key={r} className="text-center">
                      {lock ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span className="inline-flex items-center gap-1 text-muted-foreground opacity-70" tabIndex={0} aria-label={`${label}: ${lock.state ? "always on" : "always off"}. ${lock.reason}`} />
                            }
                          >
                            <input type="checkbox" checked={lock.state} disabled readOnly aria-hidden="true" tabIndex={-1} className="size-4 accent-primary" />
                            <Lock aria-hidden="true" className="size-3" />
                          </TooltipTrigger>
                          <TooltipContent>{lock.reason}</TooltipContent>
                        </Tooltip>
                      ) : (
                        <input
                          id={id} type="checkbox" aria-label={label} checked={draft[r].includes(m.key)} disabled={pending}
                          onChange={(e) => toggle(r, m.key, e.target.checked)} className="size-4 accent-primary"
                        />
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={!dirty || pending}>{pending ? "Saving…" : "Save"}</Button>
        {dirty && (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => { setDraft(initial); setError(null); }}>
            Discard
          </Button>
        )}
        {dirty && <span role="status" className="text-xs text-muted-foreground">Unsaved changes</span>}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
