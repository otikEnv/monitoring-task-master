import { describe, expect, it } from "vitest";
import type { ReleaseTask } from "@/lib/releases/model";
import { NO_FILTER, isFiltered, matchesTask, priorityOptions, statusCounts } from "@/lib/releases/task-filter";

const t = (id: string, status: ReleaseTask["status"], priority: string | null): ReleaseTask =>
  ({ taskId: id, seq: Number(id), title: `T${id}`, status, priority, subtasksTotal: 0, subtasksDone: 0 });

const tasks = [
  t("1", "done", "high"), t("2", "done", "low"), t("3", "in_progress", "medium"),
  t("4", "deferred", "medium"), t("5", "in_progress", null), t("6", "blocked", "urgent"),
];

describe("filter task release", () => {
  it("tanpa filter: semua task", () => {
    expect(tasks.filter((x) => matchesTask(x, NO_FILTER))).toHaveLength(6);
    expect(isFiltered(NO_FILTER)).toBe(false);
  });

  it("status (bisa lebih dari satu) dan prioritas digabung dengan AND", () => {
    const f = { statuses: ["in_progress", "deferred"] as ReleaseTask["status"][], priority: "medium" };
    expect(tasks.filter((x) => matchesTask(x, f)).map((x) => x.taskId)).toEqual(["3", "4"]);
    expect(isFiltered(f)).toBe(true);
  });

  it("prioritas none = task tanpa prioritas", () => {
    expect(tasks.filter((x) => matchesTask(x, { statuses: [], priority: "none" })).map((x) => x.taskId)).toEqual(["5"]);
  });

  it("pilihan status hanya yang ada, dengan jumlah, urut baku", () => {
    expect(statusCounts(tasks)).toEqual([
      { status: "in_progress", count: 2 }, { status: "blocked", count: 1 }, { status: "done", count: 2 }, { status: "deferred", count: 1 },
    ]);
  });

  it("pilihan prioritas: high, medium, low, nilai lain, lalu none", () => {
    expect(priorityOptions(tasks)).toEqual(["high", "medium", "low", "urgent", "none"]);
    expect(priorityOptions([t("1", "done", "low")])).toEqual(["low"]);
  });
});
