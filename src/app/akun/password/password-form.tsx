"use client";

import { useActionState } from "react";
import { changePassword, type PasswordState } from "./actions";

const inputClass =
  "w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:focus:border-neutral-400";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(
    changePassword,
    undefined,
  );

  return (
    <form action={action} className="max-w-sm space-y-4">
      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium">
          Password baru
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className={inputClass}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="confirm" className="text-sm font-medium">
          Ulangi password baru
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className={inputClass}
        />
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          {state.success}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      >
        {pending ? "Menyimpan…" : "Simpan password"}
      </button>
    </form>
  );
}
