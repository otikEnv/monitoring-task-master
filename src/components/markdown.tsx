import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Menampilkan teks markdown dari repo secara AMAN. Isi file tasks.json berasal dari luar aplikasi,
 * jadi diperlakukan sebagai tidak tepercaya:
 *  - HTML mentah TIDAK dieksekusi: ditampilkan sebagai teks (potongan kode seperti <Link href="..."> aman).
 *  - Gambar tidak dimuat (mencegah pelacakan lewat URL luar); diganti keterangan teks.
 *  - Tautan hanya http(s), mailto, dan anchor; selain itu (mis. javascript:) tampil sebagai teks biasa.
 *  - Tautan eksternal dibuka di tab baru dengan rel="noopener noreferrer nofollow".
 */
const SAFE_HREF = /^(https?:\/\/|mailto:|#)/i;
const EXTERNAL = /^https?:\/\//i;

const components: Components = {
  a({ href, children }) {
    if (!href || !SAFE_HREF.test(href)) return <span>{children}</span>;
    return (
      <a
        href={href}
        className="break-words underline"
        {...(EXTERNAL.test(href) ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
      >
        {children}
      </a>
    );
  },
  img({ alt }) {
    return <span className="italic text-muted-foreground">[image{alt ? `: ${alt}` : ""}]</span>;
  },
  // Judul di dalam konten diturunkan agar tidak bersaing dengan judul halaman.
  h1: ({ children }) => <h3 className="mt-4 text-base font-semibold">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-4 text-base font-semibold">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-3 text-sm font-semibold">{children}</h4>,
  h4: ({ children }) => <h5 className="mt-3 text-sm font-semibold">{children}</h5>,
  h5: ({ children }) => <h5 className="mt-3 text-sm font-semibold">{children}</h5>,
  h6: ({ children }) => <h5 className="mt-3 text-sm font-semibold">{children}</h5>,
  // whitespace-pre-line: baris baru tunggal pada teks Taskmaster tetap terlihat.
  p: ({ children }) => <p className="whitespace-pre-line break-words">{children}</p>,
  ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="whitespace-pre-line break-words">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border" />,
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  code: ({ className, children }) => (
    <code className={`rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] ${className ?? ""}`}>
      {children}
    </code>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-border px-2 py-1 font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-border px-2 py-1 align-top">{children}</td>,
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
