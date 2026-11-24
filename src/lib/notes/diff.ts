// Perbedaan isi per baris antar versi catatan (halaman History). Murni.

export type DiffLine = { type: "same" | "added" | "removed"; text: string };

/** Batas sel tabel LCS; di atas ini diff disederhanakan menjadi "semua lama dihapus, semua baru ditambah". */
const MAX_CELLS = 4_000_000;

/** Diff baris berbasis LCS (longest common subsequence). Urutan: baris yang dihapus sebelum yang ditambah. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before === "" ? [] : before.replace(/\r\n/g, "\n").split("\n");
  const b = after === "" ? [] : after.replace(/\r\n/g, "\n").split("\n");

  // Potong awalan dan akhiran yang sama agar tabel kecil.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const head: DiffLine[] = a.slice(0, start).map((text) => ({ type: "same", text }));
  const tail: DiffLine[] = a.slice(endA).map((text) => ({ type: "same", text }));
  const ma = a.slice(start, endA);
  const mb = b.slice(start, endB);

  if (ma.length * mb.length > MAX_CELLS) {
    return [
      ...head,
      ...ma.map((text): DiffLine => ({ type: "removed", text })),
      ...mb.map((text): DiffLine => ({ type: "added", text })),
      ...tail,
    ];
  }

  const n = ma.length;
  const m = mb.length;
  // lcs[i][j] = panjang LCS dari ma[i..] dan mb[j..], disimpan datar.
  const lcs = new Uint32Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[at(i, j)] = ma[i] === mb[j] ? lcs[at(i + 1, j + 1)] + 1 : Math.max(lcs[at(i + 1, j)], lcs[at(i, j + 1)]);
    }
  }
  const middle: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (ma[i] === mb[j]) {
      middle.push({ type: "same", text: ma[i] });
      i++;
      j++;
    } else if (lcs[at(i + 1, j)] >= lcs[at(i, j + 1)]) {
      middle.push({ type: "removed", text: ma[i++] });
    } else {
      middle.push({ type: "added", text: mb[j++] });
    }
  }
  while (i < n) middle.push({ type: "removed", text: ma[i++] });
  while (j < m) middle.push({ type: "added", text: mb[j++] });
  return [...head, ...middle, ...tail];
}

/** Nama kolom yang berubah antara dua versi, untuk ringkasan di daftar versi. */
export function changedFields(
  before: { title: string; noteDate: string; kind: string; body: string },
  after: { title: string; noteDate: string; kind: string; body: string },
): string[] {
  const out: string[] = [];
  if (before.title !== after.title) out.push("title");
  if (before.noteDate !== after.noteDate) out.push("date");
  if (before.kind !== after.kind) out.push("type");
  if (before.body !== after.body) out.push("content");
  return out;
}
