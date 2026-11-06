import "server-only";
import { bitbucketAdapter } from "./bitbucket";
import { githubAdapter } from "./github";
import { gitlabAdapter } from "./gitlab";
import type { Provider, ProviderAdapter } from "./types";

export * from "./types";

/**
 * Registry adapter. Menambah penyedia baru (mis. Gitea): buat adapter dengan kontrak yang sama,
 * daftarkan di sini, tambahkan ke PROVIDERS di types.ts dan enum database. Halaman tidak berubah.
 */
const ADAPTERS: Record<Provider, ProviderAdapter> = {
  github: githubAdapter,
  gitlab: gitlabAdapter,
  bitbucket: bitbucketAdapter,
};

export function getAdapter(provider: Provider): ProviderAdapter {
  const adapter = ADAPTERS[provider];
  if (!adapter) throw new Error(`Penyedia tidak didukung: ${provider}`);
  return adapter;
}
