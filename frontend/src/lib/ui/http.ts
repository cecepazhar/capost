// One colour language for HTTP methods and status codes, shared by the workbench and every page.
// Follows the Postman convention users already know: GET green, POST amber, PUT blue,
// PATCH violet, DELETE red.

export const METHOD_TEXT: Record<string, string> = {
  GET: 'text-emerald-600 dark:text-emerald-400',
  POST: 'text-amber-600 dark:text-amber-400',
  PUT: 'text-sky-600 dark:text-sky-400',
  PATCH: 'text-violet-600 dark:text-violet-400',
  DELETE: 'text-rose-600 dark:text-rose-400',
  HEAD: 'text-teal-600 dark:text-teal-400',
  OPTIONS: 'text-neutral-500 dark:text-neutral-400'
};

export const METHOD_BAR: Record<string, string> = {
  GET: 'bg-emerald-500',
  POST: 'bg-amber-500',
  PUT: 'bg-sky-500',
  PATCH: 'bg-violet-500',
  DELETE: 'bg-rose-500',
  HEAD: 'bg-teal-500',
  OPTIONS: 'bg-neutral-400'
};

export const methodText = (m: string) => METHOD_TEXT[m] ?? METHOD_TEXT.OPTIONS;
export const methodBar = (m: string) => METHOD_BAR[m] ?? METHOD_BAR.OPTIONS;
export const methodShort = (m: string) => (m === 'DELETE' ? 'DEL' : m === 'OPTIONS' ? 'OPT' : m);

/** Pill classes for an HTTP status (0 = network error). */
export function statusTone(s: number): string {
  if (!s || s >= 500) return 'bg-rose-500/12 text-rose-600 dark:text-rose-400';
  if (s >= 400) return 'bg-amber-500/12 text-amber-600 dark:text-amber-400';
  if (s >= 300) return 'bg-sky-500/12 text-sky-600 dark:text-sky-400';
  return 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400';
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function timeAgo(ts: number): string {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
