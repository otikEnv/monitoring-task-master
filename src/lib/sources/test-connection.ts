import "server-only";
import { getAdapter } from "@/lib/providers";
import { ProviderError, type Provider, type ProviderAdapter } from "@/lib/providers/types";
import { TasksFileError, countByStatus, parseTasksFile } from "@/lib/tasks/normalize";

export type ConnectionTestInput = {
  provider: Provider;
  repoUrl: string;
  branch: string;
  filePath: string;
  token: string;
};

export type ConnectionTestResult =
  | {
      ok: true;
      bytes: number;
      taskCount: number;
      tags: { tag: string; total: number }[];
      warnings: number;
      lastCommitAt: string | null;
      tokenExpiresAt: string | null;
    }
  | { ok: false; kind: string; message: string };

/**
 * Menguji koneksi sebelum menyimpan: ambil file, pastikan ia tasks.json Taskmaster yang valid,
 * dan laporkan jumlah task. Tidak menulis apa pun. Pesan galat tidak pernah memuat token.
 */
export async function runConnectionTest(
  input: ConnectionTestInput,
  deps: { getAdapter: (p: Provider) => ProviderAdapter } = { getAdapter },
): Promise<ConnectionTestResult> {
  try {
    const file = await deps.getAdapter(input.provider).fetchFile({
      repoUrl: input.repoUrl,
      branch: input.branch,
      path: input.filePath,
      token: input.token,
    });
    if (file.status !== "ok") {
      // Tanpa ETag, penyedia seharusnya selalu mengirim isi file.
      return { ok: false, kind: "unexpected", message: "The provider did not return the file content." };
    }

    const parsed = parseTasksFile(file.content);
    const tags = parsed.tags.map(({ tag, tasks }) => ({ tag, total: countByStatus(tasks).total }));
    return {
      ok: true,
      bytes: Buffer.byteLength(file.content),
      taskCount: tags.reduce((n, t) => n + t.total, 0),
      tags,
      warnings: parsed.warnings.length,
      lastCommitAt: file.lastCommitAt,
      tokenExpiresAt: file.tokenExpiresAt,
    };
  } catch (e) {
    if (e instanceof ProviderError) return { ok: false, kind: e.kind, message: e.message };
    if (e instanceof TasksFileError) {
      return {
        ok: false,
        kind: "invalid_file",
        message: `The file was found, but it is not a valid Taskmaster tasks.json. ${e.message}`,
      };
    }
    console.error("[uji-koneksi] galat tak terduga", { error: (e as Error)?.name });
    return { ok: false, kind: "internal", message: "An internal error occurred while testing the connection." };
  }
}
