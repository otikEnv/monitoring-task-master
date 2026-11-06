import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  LOOKUP_ID, buildDependencyViews, parseDependencyIds, parseSubtasks, type TaskDetail,
} from "./detail-model";

const MAX_DEPENDENCY_LOOKUPS = 200;

/**
 * Membaca satu task beserta nama aplikasi, dependensi, dan subtask-nya. Mengembalikan null bila tidak ada.
 * Klien HARUS membawa sesi pengguna (RLS berlaku). Dependensi hanya dicari pada sumber dan tag yang sama.
 */
export async function loadTaskDetail(
  db: SupabaseClient,
  key: { sourceId: string; tag: string; taskId: string },
): Promise<TaskDetail | null> {
  const [task, source] = await Promise.all([
    db.from("tasks").select("*").eq("source_id", key.sourceId).eq("tag", key.tag).eq("task_id", key.taskId).maybeSingle(),
    db.from("sources").select("id, name").eq("id", key.sourceId).maybeSingle(),
  ]);
  if (task.error) throw new Error(`Gagal membaca task: ${task.error.message}`);
  if (source.error) throw new Error(`Gagal membaca sumber: ${source.error.message}`);
  if (!task.data || !source.data) return null;

  const t = task.data as Record<string, unknown>;
  const depIds = parseDependencyIds(t.dependencies);
  const lookupIds = depIds.filter((id) => LOOKUP_ID.test(id)).slice(0, MAX_DEPENDENCY_LOOKUPS);

  let found: { task_id: string; title: string; status: string }[] = [];
  if (lookupIds.length > 0) {
    const deps = await db
      .from("tasks")
      .select("task_id, title, status")
      .eq("source_id", key.sourceId)
      .eq("tag", key.tag)
      .in("task_id", lookupIds);
    if (deps.error) throw new Error(`Gagal membaca dependensi: ${deps.error.message}`);
    found = deps.data as typeof found;
  }

  return {
    sourceId: key.sourceId,
    sourceName: (source.data as { name: string }).name,
    tag: t.tag as string,
    taskId: t.task_id as string,
    title: t.title as string,
    description: (t.description as string | null) ?? null,
    status: t.status as string,
    priority: (t.priority as string | null) ?? null,
    details: (t.details as string | null) ?? null,
    testStrategy: (t.test_strategy as string | null) ?? null,
    dependencies: buildDependencyViews(depIds, found),
    subtasks: parseSubtasks(t.subtasks),
    updatedAt: t.updated_at as string,
  };
}

/** Detail task untuk pengguna yang sedang login (sesi dari cookie). */
export async function getTaskDetail(key: { sourceId: string; tag: string; taskId: string }) {
  return loadTaskDetail(await createClient(), key);
}
