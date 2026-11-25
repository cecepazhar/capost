<script lang="ts">
  import { getWorkbench, type HistoryEntry } from '$lib/stores/workbench.svelte';
  import { goto } from '$app/navigation';
  import { showToast } from '$lib/stores/uiNotifications.svelte';
  import PageHead from '$lib/components/page/PageHead.svelte';
  import { methodText, methodShort, statusTone, formatBytes, timeAgo } from '$lib/ui/http';

  const wb = getWorkbench();
  const history = $derived(wb.history);

  let filter = $state('');
  let status = $state<'all' | 'ok' | 'fail'>('all');

  const rows = $derived(
    history.filter((h) => {
      if (status === 'ok' && !(h.status > 0 && h.status < 400)) return false;
      if (status === 'fail' && h.status > 0 && h.status < 400) return false;
      const q = filter.trim().toLowerCase();
      return !q || h.url.toLowerCase().includes(q) || h.method.toLowerCase() === q || String(h.status).startsWith(q);
    })
  );

  function replay(h: HistoryEntry) {
    wb.newTab({ ...JSON.parse(JSON.stringify(h.request)), id: crypto.randomUUID() }, { id: `hist:${h.id}`, collectionId: null }, { preview: true, response: h.response ?? null });
    goto('/requests');
  }
  function clearAll() {
    if (!confirm(`Clear all ${history.length} history entries?`)) return;
    wb.clearHistory();
    showToast('History cleared', 'info');
  }
</script>

<div class="cp-page h-full">
  <PageHead title="History" subtitle={`${history.length} requests sent · click a row to reopen it with its response`}>
    {#snippet actions()}
      {#if history.length}
        <button class="cp-btn cp-btn-danger" onclick={clearAll}>Clear history</button>
      {/if}
    {/snippet}
  </PageHead>

  <div class="cp-card flex flex-col min-h-0 flex-1 overflow-hidden">
    <div class="flex flex-wrap items-center gap-2 p-2 border-b border-neutral-200 dark:border-neutral-800">
      <input class="cp-input !w-72 max-w-full" placeholder="Filter by URL, method or status" bind:value={filter} />
      <div class="wb-seg">
        {#each [['all', 'All'], ['ok', 'Success'], ['fail', 'Failed']] as [k, label] (k)}
          <button class={status === k ? 'is-active' : ''} onclick={() => (status = k as typeof status)}>{label}</button>
        {/each}
      </div>
      <span class="ml-auto pr-2 cp-muted">{rows.length} shown</span>
    </div>

    {#if rows.length === 0}
      <div class="cp-empty flex-1">
        <div class="cp-empty-icon">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
        <p class="text-[13px] font-medium text-neutral-800 dark:text-neutral-200">{history.length ? 'No matching requests' : 'No history yet'}</p>
        <p class="cp-muted">{history.length ? 'Try a different filter.' : 'Requests you send from the workbench show up here.'}</p>
        {#if !history.length}<button class="cp-btn cp-btn-primary mt-2" onclick={() => goto('/requests')}>Open workbench</button>{/if}
      </div>
    {:else}
      <div class="flex-1 min-h-0 overflow-y-auto wb-scroll">
        <table class="cp-table">
          <thead class="sticky top-0 z-[1]">
            <tr>
              <th class="w-20">Status</th>
              <th class="w-16">Method</th>
              <th>URL</th>
              <th class="w-24 text-right">Time</th>
              <th class="w-24 text-right">Size</th>
              <th class="w-24 text-right">When</th>
            </tr>
          </thead>
          <tbody>
            {#each rows as h (h.id)}
              <tr class="cursor-pointer" onclick={() => replay(h)} title="Open in workbench">
                <td><span class="cp-pill {statusTone(h.status)}">{h.status || 'ERR'}</span></td>
                <td class="font-mono text-[11px] font-bold {methodText(h.method)}">{methodShort(h.method)}</td>
                <td class="max-w-0"><div class="truncate font-mono text-[12px] text-neutral-700 dark:text-neutral-300">{h.url}</div></td>
                <td class="text-right font-mono text-[11.5px] {h.elapsedMs > 2000 ? 'text-rose-500' : h.elapsedMs > 500 ? 'text-amber-500' : 'text-neutral-500'}">{h.elapsedMs} ms</td>
                <td class="text-right font-mono text-[11.5px] text-neutral-500">{formatBytes(h.sizeBytes)}</td>
                <td class="text-right text-[11.5px] text-neutral-500">{timeAgo(h.timestamp)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>
