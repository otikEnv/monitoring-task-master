import { AlertTriangle, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** Galat memuat data: pesan umum, tanpa detail internal. */
export function LoadError({ title }: { title: string }) {
  return (
    <Alert variant="destructive">
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>Coba muat ulang halaman ini. Bila terus terjadi, hubungi admin.</AlertDescription>
    </Alert>
  );
}

/** Catatan netral (mis. filter yang diabaikan). */
export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <Alert role="status">
      <Info aria-hidden="true" />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function EmptyState({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
      {title && <p className="mb-1 font-medium text-foreground">{title}</p>}
      {children}
    </div>
  );
}
