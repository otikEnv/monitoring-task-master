import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  TasksFileError,
  countByStatus,
  parseTasksFile,
  toSnapshotRow,
  toTaskRow,
} from "@/lib/tasks/normalize";

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
const task = (over: Record<string, unknown> = {}) => ({
  id: "1",
  title: "T",
  status: "pending",
  ...over,
});
const parse = (obj: unknown) => parseTasksFile(JSON.stringify(obj));

describe("deteksi bentuk file", () => {
  it("mengenali bentuk per-tag", () => {
    const r = parse({ master: { tasks: [task()] } });
    expect(r.shape).toBe("per-tag");
    expect(r.tags.map((t) => t.tag)).toEqual(["master"]);
    expect(r.tags[0].tasks).toHaveLength(1);
  });

  it("mengenali bentuk lama { tasks } dan memberinya tag master", () => {
    const r = parse({ tasks: [task()] });
    expect(r.shape).toBe("legacy");
    expect(r.tags).toEqual([expect.objectContaining({ tag: "master" })]);
  });

  it("mendukung banyak tag dan mengabaikan kunci non-task seperti metadata", () => {
    const r = parse({
      master: { tasks: [task({ id: "1" })] },
      "fitur-x": { tasks: [task({ id: "1" }), task({ id: "2" })] },
      metadata: { version: "1" },
    });
    expect(r.tags.map((t) => [t.tag, t.tasks.length])).toEqual([
      ["master", 1],
      ["fitur-x", 2],
    ]);
  });

  it("ID yang sama di tag berbeda tidak dianggap ganda", () => {
    const r = parse({
      a: { tasks: [task({ id: "1" })] },
      b: { tasks: [task({ id: "1" })] },
    });
    expect(r.warnings).toEqual([]);
  });

  it("array task kosong valid dan berarti 0 task (bukan galat)", () => {
    expect(parse({ tasks: [] }).tags[0].tasks).toEqual([]);
    expect(parse({ master: { tasks: [] } }).tags[0].tasks).toEqual([]);
  });

  it("mengabaikan BOM di awal file", () => {
    const r = parseTasksFile("﻿" + JSON.stringify({ tasks: [task()] }));
    expect(r.tags[0].tasks).toHaveLength(1);
  });
});

describe("galat (tidak pernah dianggap 0 task)", () => {
  const code = (text: string) => {
    try {
      parseTasksFile(text);
    } catch (e) {
      expect(e).toBeInstanceOf(TasksFileError);
      return (e as TasksFileError).code;
    }
    throw new Error("seharusnya melempar galat");
  };

  it("JSON rusak", () => expect(code("{ rusak")).toBe("invalid_json"));
  it("file kosong", () => {
    expect(code("")).toBe("invalid_json");
    expect(code("   \n")).toBe("invalid_json");
  });
  it("akar bukan objek", () => {
    expect(code("[]")).toBe("invalid_shape");
    expect(code('"teks"')).toBe("invalid_shape");
    expect(code("null")).toBe("invalid_shape");
  });
  it("tidak ada tasks di mana pun (misalnya package.json)", () => {
    expect(code(JSON.stringify({ name: "x", version: "1.0.0" }))).toBe("invalid_shape");
    expect(code(JSON.stringify({ master: { metadata: {} } }))).toBe("invalid_shape");
    expect(code(JSON.stringify({ tasks: "bukan array" }))).toBe("invalid_shape");
  });
});

describe("normalisasi task", () => {
  it("menyeragamkan tipe ID: task string, subtask angka, dependensi string", () => {
    const [t] = parse({
      tasks: [
        task({
          id: 7,
          dependencies: ["5", 6],
          subtasks: [{ id: 1, title: "a", status: "done", dependencies: [] }],
        }),
      ],
    }).tags[0].tasks;
    expect(t.id).toBe("7");
    expect(t.dependencies).toEqual(["5", "6"]);
    expect(t.subtasks[0].id).toBe("1");
  });

  it("testStrategy dan field teks yang kosong menjadi null", () => {
    const [t] = parse({
      tasks: [task({ testStrategy: "", description: null, details: "  " })],
    }).tags[0].tasks;
    expect(t.testStrategy).toBeNull();
    expect(t.description).toBeNull();
    expect(t.details).toBeNull();
    expect(t.priority).toBeNull();
  });

  it("memangkas dan merendahkan huruf status dan prioritas, status tak dikenal dipertahankan", () => {
    const tasks = parse({
      tasks: [
        task({ id: "1", status: " Done ", priority: "HIGH" }),
        task({ id: "2", status: "aneh" }),
      ],
    }).tags[0].tasks;
    expect(tasks[0].status).toBe("done");
    expect(tasks[0].priority).toBe("high");
    expect(tasks[1].status).toBe("aneh");
  });

  it("status hilang dianggap pending dengan peringatan; judul hilang diberi pengganti", () => {
    const r = parse({ tasks: [{ id: "1" }] });
    expect(r.tags[0].tasks[0]).toMatchObject({ status: "pending", title: "(tanpa judul)" });
    expect(r.warnings.length).toBe(2);
  });

  it("melewati task tanpa ID atau bukan objek, dengan peringatan", () => {
    const r = parse({ tasks: [task({ id: "1" }), { title: "tanpa id" }, "x", null] });
    expect(r.tags[0].tasks.map((t) => t.id)).toEqual(["1"]);
    expect(r.warnings).toHaveLength(3);
  });

  it("ID ganda dalam satu tag: yang pertama dipakai, ada peringatan", () => {
    const r = parse({
      tasks: [task({ id: "1", title: "pertama" }), task({ id: "1", title: "kedua" })],
    });
    expect(r.tags[0].tasks).toHaveLength(1);
    expect(r.tags[0].tasks[0].title).toBe("pertama");
    expect(r.warnings[0]).toMatch(/duplicate/);
  });

  it("dependensi bukan array menjadi daftar kosong; subtasks bukan array menjadi kosong", () => {
    const [t] = parse({ tasks: [task({ dependencies: "5", subtasks: "x" })] }).tags[0].tasks;
    expect(t.dependencies).toEqual([]);
    expect(t.subtasks).toEqual([]);
  });

  it("ID subtask yang tidak unik (anomali data asli) diganti nomor urut", () => {
    const r = parse({
      tasks: [
        task({
          id: "1",
          subtasks: [
            { id: 1, title: "a", status: "done" },
            { id: 1, title: "b", status: "pending" },
            { id: 1, title: "c", status: "pending" },
          ],
        }),
      ],
    });
    expect(r.tags[0].tasks[0].subtasks.map((s) => s.id)).toEqual(["1", "2", "3"]);
    expect(r.warnings[0]).toMatch(/subtask IDs are not unique/);
  });

  it("ID subtask yang sudah unik dipertahankan apa adanya", () => {
    const r = parse({
      tasks: [task({ subtasks: [{ id: 3, title: "a" }, { id: 5, title: "b" }] })],
    });
    expect(r.tags[0].tasks[0].subtasks.map((s) => s.id)).toEqual(["3", "5"]);
    expect(r.warnings).toEqual([]);
  });
});

describe("countByStatus", () => {
  it("menghitung tujuh status, status tak dikenal ke 'other', dan persentase", () => {
    const mk = (status: string) => ({ status });
    const c = countByStatus([
      mk("pending"), mk("in-progress"), mk("review"), mk("blocked"),
      mk("done"), mk("done"), mk("deferred"), mk("cancelled"), mk("aneh"),
    ]);
    expect(c).toMatchObject({
      total: 9, pending: 1, in_progress: 1, review: 1, blocked: 1,
      done: 2, deferred: 1, cancelled: 1, other: 1,
    });
    expect(c.percent_done).toBe(22.22);
  });

  it("daftar kosong: semua 0 dan persentase 0 (tanpa pembagian nol)", () => {
    const c = countByStatus([]);
    expect(c.total).toBe(0);
    expect(c.percent_done).toBe(0);
  });

  it("jumlah semua kategori sama dengan total", () => {
    const c = countByStatus([{ status: "done" }, { status: "x" }, { status: "blocked" }]);
    const sum = c.pending + c.in_progress + c.review + c.blocked + c.done + c.deferred + c.cancelled + c.other;
    expect(sum).toBe(c.total);
  });
});

describe("pemetaan ke baris database", () => {
  const [t] = parse({
    tasks: [
      task({
        id: "9", testStrategy: "uji", dependencies: ["1"],
        subtasks: [
          { id: 1, title: "a", status: "done" },
          { id: 2, title: "b", status: "pending" },
          { id: 3, title: "c", status: "done" },
        ],
      }),
    ],
  }).tags[0].tasks;

  it("toTaskRow memakai nama kolom tabel tasks dan menurunkan jumlah subtask", () => {
    const row = toTaskRow("src-1", "master", t);
    expect(row).toMatchObject({
      source_id: "src-1", tag: "master", task_id: "9", test_strategy: "uji",
      dependencies: ["1"], subtasks_total: 3, subtasks_done: 2,
    });
    expect(Object.keys(row)).toEqual(expect.arrayContaining([
      "source_id", "tag", "task_id", "title", "description", "status", "priority",
      "dependencies", "details", "test_strategy", "subtasks", "subtasks_total", "subtasks_done",
    ]));
  });

  it("toSnapshotRow memakai nama kolom snapshots dan tidak mengisi percent_done", () => {
    const row = toSnapshotRow("src-1", "master", [t]);
    expect(row).toMatchObject({ source_id: "src-1", tag: "master", total: 1, pending: 1, blocked: 0, other: 0 });
    expect(row).not.toHaveProperty("percent_done"); // kolom generated di database
  });
});

describe("fixture echoapp tersanitasi (struktur data asli)", () => {
  const r = parseTasksFile(fixture("echoapp.sanitized.json"));

  it("terbaca sebagai bentuk per-tag dengan tag master", () => {
    expect(r.shape).toBe("per-tag");
    expect(r.tags.map((t) => t.tag)).toEqual(["master"]);
    expect(r.tags[0].tasks).toHaveLength(6);
  });

  it("memuat status blocked dan menghitungnya, bukan 'other'", () => {
    const c = countByStatus(r.tags[0].tasks);
    expect(c.blocked).toBe(1);
    expect(c.other).toBe(0);
  });

  it("semua ID berupa string, dan ID subtask ganda ditangani", () => {
    const tasks = r.tags[0].tasks;
    expect(tasks.every((t) => typeof t.id === "string")).toBe(true);
    for (const t of tasks) {
      const ids = t.subtasks.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(r.warnings.some((w) => /subtask IDs are not unique/.test(w))).toBe(true);
  });
});

// Data asli penuh (658 KB) hanya ada di mesin yang sudah menjalankan `npm run aggregate`.
// File ini tidak di-commit, jadi di CI tes ini dilewati.
const REAL = path.join(__dirname, "..", ".aggregate-out", "echoapp.raw.json");
describe.skipIf(!fs.existsSync(REAL))("data asli echoapp (lokal)", () => {
  it("terbaca penuh tanpa galat, hitungan sesuai hasil Fase 0", () => {
    const t0 = performance.now();
    const r = parseTasksFile(fs.readFileSync(REAL, "utf8"));
    const ms = performance.now() - t0;
    const tasks = r.tags[0].tasks;
    const c = countByStatus(tasks);

    expect(r.tags[0].tag).toBe("master");
    expect(c.total).toBeGreaterThan(100);
    expect(c.other).toBe(0); // semua status asli termasuk blocked dikenali
    expect(tasks.every((t) => t.id !== "")).toBe(true);
    expect(tasks.some((t) => t.testStrategy === null)).toBe(true);
    expect(ms).toBeLessThan(1000);
  });
});
