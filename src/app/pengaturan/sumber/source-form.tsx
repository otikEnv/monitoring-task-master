"use client";

import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { formatBytes, formatDateTime } from "@/lib/format";
import type { FieldErrors } from "@/lib/sources/validate";
import { saveSource, testConnection, type TestResult } from "./actions";

export type FormInitial = {
  id?: string;
  name: string;
  provider: "github" | "gitlab" | "bitbucket";
  repoUrl: string;
  branch: string;
  filePath: string;
  hasToken: boolean;
  /** yyyy-mm-dd */
  tokenExpiresOn: string;
};

const TOKEN_HINT: Record<FormInitial["provider"], string> = {
  github: "Fine-grained token dengan izin Contents: Read-only pada repo ini. Hindari token classic scope repo (baca-tulis).",
  gitlab: "Project/Personal Access Token dengan scope read_repository.",
  bitbucket: "Repository Access Token dengan izin Repositories: Read.",
};

function Field({
  label, htmlFor, error, hint, children,
}: { label: string; htmlFor: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function SourceForm({ initial }: { initial: FormInitial }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [provider, setProvider] = useState(initial.provider);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  const editing = Boolean(initial.id);

  // Action dipanggil langsung (bukan lewat <form action>) agar isian tidak di-reset React
  // setelah action selesai; token yang sudah diketik tidak hilang saat uji koneksi.
  const data = () => new FormData(formRef.current!);

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    const fd = data();
    startSave(async () => {
      const res = await saveSource(fd); // sukses = redirect, tidak kembali ke sini
      if (res && !res.ok) {
        setErrors(res.fieldErrors ?? {});
        setFormError(res.error ?? null);
      }
    });
  }

  function onTest() {
    setErrors({});
    setTest(null);
    const fd = data();
    startTest(async () => {
      const res = await testConnection(fd);
      setTest(res);
      if (!res.ok && "fieldErrors" in res) setErrors(res.fieldErrors);
    });
  }

  return (
    <Card>
      <CardContent>
    <form ref={formRef} onSubmit={onSave} className="space-y-5">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <Field label="Nama aplikasi" htmlFor="name" error={errors.name}>
        <Input id="name" name="name" defaultValue={initial.name} required maxLength={100} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Penyedia repo" htmlFor="provider" error={errors.provider}>
          <NativeSelect
            id="provider" name="provider" value={provider}
            onChange={(e) => setProvider(e.target.value as FormInitial["provider"])}
            className="w-full"
          >
            <option value="github">GitHub</option>
            <option value="gitlab">GitLab</option>
            <option value="bitbucket">Bitbucket</option>
          </NativeSelect>
        </Field>
        <Field label="Branch yang dipantau" htmlFor="branch" error={errors.branch} hint="Branch acuan ini ditampilkan di dashboard.">
          <Input id="branch" name="branch" defaultValue={initial.branch} required />
        </Field>
      </div>

      <Field
        label="URL repo" htmlFor="repoUrl" error={errors.repoUrl}
        hint={provider === "gitlab" ? "GitLab self-hosted didukung: pakai alamat repo di server Anda." : undefined}
      >
        <Input
          id="repoUrl" name="repoUrl" defaultValue={initial.repoUrl} required inputMode="url"
          placeholder={provider === "github" ? "https://github.com/owner/repo" : provider === "gitlab" ? "https://gitlab.com/grup/proyek" : "https://bitbucket.org/workspace/repo"}
        />
      </Field>

      <Field label="Path file task master" htmlFor="filePath" error={errors.filePath}>
        <Input id="filePath" name="filePath" defaultValue={initial.filePath} required />
      </Field>

      <Field
        label={editing ? "Token baru (opsional)" : "Token akses (baca-saja)"}
        htmlFor="token" error={errors.token} hint={TOKEN_HINT[provider]}
      >
        <Input
          id="token" name="token" type="password" autoComplete="new-password" spellCheck={false}
          placeholder={editing && initial.hasToken ? "••••••••  (tersimpan; kosongkan bila tidak diubah)" : ""}
          required={!editing}
        />
        <p className="text-xs text-muted-foreground">
          Token disimpan terenkripsi dan tidak akan ditampilkan lagi.
        </p>
      </Field>

      <Field
        label="Token kedaluwarsa pada (opsional)" htmlFor="tokenExpiresAt" error={errors.tokenExpiresAt}
        hint="Untuk GitHub diisi otomatis saat sinkronisasi."
      >
        <Input id="tokenExpiresAt" name="tokenExpiresAt" type="date" defaultValue={initial.tokenExpiresOn} className="sm:w-56" />
      </Field>

      {test && <TestPanel result={test} />}
      {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={saving || testing}>
          {saving ? "Menyimpan…" : "Simpan"}
        </Button>
        <Button type="button" variant="outline" onClick={onTest} disabled={testing || saving}>
          {testing ? "Menguji…" : "Uji koneksi"}
        </Button>
        <Link href="/pengaturan/sumber" className={buttonVariants({ variant: "ghost" })}>Batal</Link>
      </div>
    </form>
      </CardContent>
    </Card>
  );
}

function TestPanel({ result }: { result: TestResult }) {
  if (result.ok) {
    return (
      <Alert role="status">
        <CheckCircle2 className="text-green-600" aria-hidden="true" />
        <AlertTitle>Koneksi berhasil</AlertTitle>
        <AlertDescription className="space-y-1">
          <p>
            File ditemukan ({formatBytes(result.bytes)}), berisi <strong>{result.taskCount} task</strong> dalam{" "}
            {result.tags.length} tag ({result.tags.map((t) => `${t.tag}: ${t.total}`).join(", ")}).
          </p>
          <p>
            Commit terakhir file: {formatDateTime(result.lastCommitAt)}
            {result.tokenExpiresAt && ` · Token kedaluwarsa: ${formatDateTime(result.tokenExpiresAt)}`}
            {result.warnings > 0 && ` · ${result.warnings} catatan data (mis. ID subtask ganda, sudah ditangani)`}
          </p>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="destructive">
      <XCircle aria-hidden="true" />
      <AlertTitle>{result.kind === "validation" ? "Isian belum lengkap" : "Koneksi gagal"}</AlertTitle>
      <AlertDescription>{result.message}</AlertDescription>
    </Alert>
  );
}
