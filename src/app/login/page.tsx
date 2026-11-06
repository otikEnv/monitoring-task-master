import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Monitoring Task Master</h1>
          <p className="text-sm text-neutral-500">
            Masuk untuk melihat progres semua aplikasi.
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
