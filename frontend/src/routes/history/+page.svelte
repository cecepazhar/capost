<script lang="ts">
  import { getWorkbench } from '$lib/stores/workbench.svelte';
  import { goto } from '$app/navigation';
  import { showToast } from '$lib/stores/uiNotifications.svelte';

  const wb = getWorkbench();
  let history = $state(wb.history);

  function replay(entry: any) {
    wb.loadRequest(entry.request);
    goto('/');
    showToast('Request loaded into editor', 'info');
  }

  function timeAgo(ts: number) {
    const diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 60) return 'just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function methodColor(method: string): string {
    if (method === 'GET') return 'text-emerald-600 dark:text-emerald-400';
    if (method === 'POST') return 'text-blue-600 dark:text-blue-400';
    if (method === 'PUT') return 'text-amber-600 dark:text-amber-400';
    if (method === 'DELETE') return 'text-rose-600 dark:text-rose-400';
    if (method === 'PATCH') return 'text-purple-600 dark:text-purple-400';
    return 'text-neutral-500 dark:text-neutral-400';
  }

  function statusPillColor(status: number): string {
    if (status >= 500) return 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/30';
    if (status >= 400) return 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30';
    if (status === 0) return 'text-neutral-500 bg-neutral-500/10 border-neutral-500/30';
    return 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
  }
</script>

<div class="flex flex-col h-full max-w-6xl mx-auto p-6 space-y-5">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-lg font-bold text-neutral-900 dark:text-white">Request History</h1>
      <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
        {history.length} past executions · Inspect timings, payloads, and replay requests
      </p>
    </div>
    {#if history.length > 0}
      <button
        onclick={() => {
          wb.clearHistory();
          history = wb.history;
          showToast('History cleared', 'info');
        }}
        class="px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
      >
        Clear History
      </button>
    {/if}
  </div>

  <!-- History List -->
  <div class="flex-1 overflow-y-auto space-y-2.5">
    {#if history.length === 0}
      <div class="text-center py-12">
        <svg class="w-12 h-12 mx-auto text-neutral-300 dark:text-neutral-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-sm text-neutral-400 dark:text-neutral-500">No request history yet.</p>
        <p class="text-xs text-neutral-300 dark:text-neutral-600 mt-1">Sent requests will be logged here for inspection and replay.</p>
      </div>
    {:else}
      {#each history as entry (entry.id)}
        <div
          class="flex items-center justify-between p-3.5 bg-white dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 rounded-xl hover:border-neutral-300 dark:hover:border-neutral-700 transition-all group"
        >
          <!-- Left: Method + URL -->
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <span
              class="text-[11px] font-mono font-bold px-2 py-0.5 rounded border shrink-0 {statusPillColor(entry.status)}"
            >
              {entry.status || 'ERR'}
            </span>

            <span class="text-xs font-mono font-bold {methodColor(entry.method)} shrink-0">{entry.method}</span>

            <span class="text-xs font-mono text-neutral-700 dark:text-neutral-300 truncate flex-1">{entry.url}</span>
          </div>

          <!-- Right: Metrics + Actions -->
          <div class="flex items-center gap-4 shrink-0 ml-4">
            <!-- Latency pill -->
            <span
              class="text-[11px] font-mono px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 {entry.elapsedMs > 2000 ? 'text-rose-500 dark:text-rose-400' : entry.elapsedMs > 500 ? 'text-amber-500 dark:text-amber-400' : ''}"
            >
              {entry.elapsedMs} ms
            </span>

            <!-- Size -->
            <span class="text-[11px] font-mono text-neutral-400 dark:text-neutral-500 w-14 text-right">{formatSize(entry.sizeBytes)}</span>

            <!-- Timestamp -->
            <span class="text-[11px] text-neutral-400 dark:text-neutral-500 w-16 text-right">{timeAgo(entry.timestamp)}</span>

            <!-- Replay Action -->
            <button
              onclick={() => replay(entry)}
              class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg border border-neutral-200 dark:border-neutral-700 transition-colors group-hover:bg-indigo-50 group-hover:text-indigo-700 group-hover:border-indigo-200 group-hover:dark:bg-indigo-950/40 group-hover:dark:text-indigo-400 group-hover:dark:border-indigo-800/50"
              title="Load into editor and open workbench"
            >
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Replay</span>
            </button>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>
