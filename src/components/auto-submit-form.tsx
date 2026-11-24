"use client";

import Form from "next/form";

/**
 * Form GET yang langsung diterapkan saat pilihan (select) atau tanggal lengkap diganti, dengan navigasi sisi klien.
 * Isian teks dan tanggal yang dikosongkan tidak dikirim otomatis: tetap lewat Enter atau tombol submit.
 */
export function AutoSubmitForm({
  action, className, children, ...rest
}: { action: string; className?: string; children: React.ReactNode } & Omit<React.ComponentProps<"form">, "action" | "onChange">) {
  return (
    <Form
      action={action}
      className={className}
      onChange={(e) => {
        const t = e.target as HTMLElement;
        // Tanggal yang sedang diketik sebagian bernilai kosong: tunggu sampai lengkap agar filter tidak terhapus.
        if (t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && t.type === "date" && t.value !== "")) {
          e.currentTarget.requestSubmit();
        }
      }}
      {...rest}
    >
      {children}
    </Form>
  );
}
