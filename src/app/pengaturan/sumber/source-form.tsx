"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
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

const input =
  "w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:focus:border-neutral-400";

const TOKEN_HINT: Record<FormInitial["provider"], string> = {
  github: "Fine-grained token dengan izin Contents: Read-only pada repo ini. Hindari token classic scope repo (baca-tulis).",
  gitlab: "Project/Personal Access Token dengan scope read_repository.",
  bitbucket: "Repository Access Token dengan izin Repositories: Read.",
};

function Field({
  label, htmlFor, error, hint, children,
}: { label: string; htmlFor: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-neutral-500">{hint}</p>}
      {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
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
    <form ref={formRef} onSubmit={onSave} className="max-w-2xl space-y-5">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <Field label="Nama aplikasi" htmlFor="name" error={errors.name}>
        <input id="name" name="name" defaultValue={initial.name} required maxLength={100} className={input} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Penyedia repo" htmlFor="provider" error={errors.provider}>
          <select
            id="provider" name="provider" value={provider}
            onChange={(e) => setProvider(e.target.value as FormInitial["provider"])}
            className={input}
          >
            <option value="github">GitHub</option>
            <option value="gitlab">GitLab</option>
            <option value="bitbucket">Bitbucket</option>
          </select>
        </Field>
        <Field label="Branch yang dipantau" htmlFor="branch" error={errors.branch} hint="Branch acuan ini ditampilkan di dashboard.">
          <input id="branch" name="branch" defaultValue={initial.branch} required className={input} />
        </Field>
      </div>

      <Field
        label="URL repo" htmlFor="repoUrl" error={errors.repoUrl}
        hint={provider === "gitlab" ? "GitLab self-hosted didukung: pakai alamat repo di server Anda." : undefined}
      >
        <input
          id="repoUrl" name="repoUrl" defaultValue={initial.repoUrl} required inputMode="url"
          placeholder={provider === "github" ? "https://github.com/owner/repo" : provider === "gitlab" ? "https://gitlab.com/grup/proyek" : "https://bitbucket.org/workspace/repo"}
          className={input}
        />
      </Field>

      <Field label="Path file task master" htmlFor="filePath" error={errors.filePath}>
        <input id="filePath" name="filePath" defaultValue={initial.filePath} required className={input} />
      </Field>

      <Field
        label={editing ? "Token baru (opsional)" : "Token akses (baca-saja)"}
        htmlFor="token" error={errors.token} hint={TOKEN_HINT[provider]}
      >
        <input
          id="token" name="token" type="password" autoComplete="new-password" spellCheck={false}
          placeholder={editing && initial.hasToken ? "••••••••  (tersimpan; kosongkan bila tidak diubah)" : ""}
          required={!editing} className={input}
        />
        <p className="text-xs text-neutral-500">
          Token disimpan terenkripsi dan tidak akan ditampilkan lagi.
        </p>
      </Field>

      <Field
        label="Token kedaluwarsa pada (opsional)" htmlFor="tokenExpiresAt" error={errors.tokenExpiresAt}
        hint="Untuk GitHub diisi otomatis saat sinkronisasi."
      >
        <input id="tokenExpiresAt" name="tokenExpiresAt" type="date" defaultValue={initial.tokenExpiresOn} className={`${input} sm:w-56`} />
      </Field>

      {test && <TestPanel result={test} />}
      {formError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{formError}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button" onClick={onTest} disabled={testing || saving}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          {testing ? "Menguji…" : "Uji koneksi"}
        </button>
        <button
          type="submit" disabled={saving || testing}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          {saving ? "Menyimpan…" : "Simpan"}
        </button>
        <Link href="/pengaturan/sumber" className="text-sm text-neutral-500 hover:underline">Batal</Link>
      </div>
    </form>
  );
}

function TestPanel({ result }: { result: TestResult }) {
  if (result.ok) {
    return (
      <div role="status" className="space-y-1 rounded-md border border-green-600/40 bg-green-600/10 p-3 text-sm">
        <p className="font-medium text-green-800 dark:text-green-300">Koneksi berhasil</p>
        <p>
          File ditemukan ({formatBytes(result.bytes)}), berisi <strong>{result.taskCount} task</strong> dalam{" "}
          {result.tags.length} tag ({result.tags.map((t) => `${t.tag}: ${t.total}`).join(", ")}).
        </p>
        <p className="text-neutral-600 dark:text-neutral-400">
          Commit terakhir file: {formatDateTime(result.lastCommitAt)}
          {result.tokenExpiresAt && ` · Token kedaluwarsa: ${formatDateTime(result.tokenExpiresAt)}`}
          {result.warnings > 0 && ` · ${result.warnings} catatan data (mis. ID subtask ganda, sudah ditangani)`}
        </p>
      </div>
    );
  }
  return (
    <div role="alert" className="rounded-md border border-red-600/40 bg-red-600/10 p-3 text-sm">
      <p className="font-medium text-red-800 dark:text-red-300">
        {result.kind === "validation" ? "Isian belum lengkap" : "Koneksi gagal"}
      </p>
      <p>{result.message}</p>
    </div>
  );
}
