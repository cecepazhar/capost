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
  let selectedId = $state<string | null>(null);
  let pane = $state<'response' | 'headers' | 'request'>('response');

  const rows = $derived(
    history.filter((h) => {
      if (status === 'ok' && !(h.status > 0 && h.status < 400)) return false;
      if (status === 'fail' && h.status > 0 && h.status < 400) return false;
      const q = filter.trim().toLowerCase();
      return !q || h.url.toLowerCase().includes(q) || h.method.toLowerCase() === q || String(h.status).startsWith(q);
    })
  );
  const selected = $derived(history.find((h) => h.id === selectedId) ?? rows[0] ?? null);

  const pretty = (body: string | undefined) => {
    if (!body) return '';
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  };

  function reopen(h: HistoryEntry) {
    wb.newTab({ ...JSON.parse(JSON.stringify(h.request)), id: crypto.randomUUID() }, { id: `hist:${h.id}`, collectionId: null }, { preview: true, response: h.response ?? null });
    goto('/requests');
  }
  function remove(h: HistoryEntry) {
    wb.deleteHistoryEntry(h.id);
    if (selectedId === h.id) selectedId = null;
  }
  function clearAll() {
    if (!confirm(`Clear all ${history.length} history entries?`)) return;
    wb.clearHistory();
    selectedId = null;
    showToast('History cleared', 'info');
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (!rows.length || (e.target as HTMLElement)?.closest('input, textarea, select')) return;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;
    const i = rows.findIndex((r) => r.id === selected?.id);
    if (e.key === 'Enter' && selected) return reopen(selected);
    e.preventDefault();
    const next = e.key === 'ArrowDown' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1);
    selectedId = rows[next].id;
  }}
/>

<div class="cp-view">
  <PageHead title="History" subtitle={`${history.length} requests sent · ↑↓ to browse, Enter to reopen`}>
    {#snippet actions()}
      {#if history.length}
        <button class="cp-btn cp-btn-danger" onclick={clearAll}>Clear history</button>
      {/if}
    {/snippet}
  </PageHead>

  <div class="flex items-center gap-2 px-4 h-11 shrink-0 border-b border-neutral-200 dark:border-neutral-800">
    <input class="cp-input !h-7 !w-80 max-w-full" placeholder="Filter by URL, method or status" bind:value={filter} />
    <div class="wb-seg">
      {#each [['all', 'All'], ['ok', 'Success'], ['fail', 'Failed']] as [k, label] (k)}
        <button class={status === k ? 'is-active' : ''} onclick={() => (status = k as typeof status)}>{label}</button>
      {/each}
    </div>
    <span class="ml-auto cp-muted">{rows.length} shown</span>
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
    <div class="cp-body">
      <!-- list -->
      <div class="cp-pane flex-1">
        <div class="cp-scroll">
          <table class="cp-table">
            <thead class="sticky top-0 z-[1]">
              <tr>
                <th class="w-20">Status</th>
                <th class="w-16">Method</th>
                <th>URL</th>
                <th class="w-24 text-right">Time</th>
                <th class="w-24 text-right hidden xl:table-cell">Size</th>
                <th class="w-24 text-right">When</th>
              </tr>
            </thead>
            <tbody>
              {#each rows as h (h.id)}
                <tr class="cursor-pointer {selected?.id === h.id ? '!bg-brand-500/10' : ''}" onclick={() => (selectedId = h.id)} ondblclick={() => reopen(h)}>
                  <td><span class="cp-pill {statusTone(h.status)}">{h.status || 'ERR'}</span></td>
                  <td class="font-mono text-[11px] font-bold {methodText(h.method)}">{methodShort(h.method)}</td>
                  <td class="max-w-0"><div class="truncate font-mono text-[12px] text-neutral-700 dark:text-neutral-300">{h.url}</div></td>
                  <td class="text-right font-mono text-[11.5px] {h.elapsedMs > 2000 ? 'text-rose-500' : h.elapsedMs > 500 ? 'text-amber-500' : 'text-neutral-500'}">{h.elapsedMs} ms</td>
                  <td class="text-right font-mono text-[11.5px] text-neutral-500 hidden xl:table-cell">{formatBytes(h.sizeBytes)}</td>
                  <td class="text-right text-[11.5px] text-neutral-500">{timeAgo(h.timestamp)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      <!-- detail -->
      <aside class="cp-pane w-[44%] max-w-[720px] min-w-[360px] border-l border-neutral-200 dark:border-neutral-800 hidden md:flex">
        {#if selected}
          {@const res = selected.response}
          <div class="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
            <div class="flex items-center gap-2">
              <span class="cp-pill {statusTone(selected.status)}">{selected.status || 'ERR'} {selected.statusText}</span>
              <span class="font-mono text-[11px] font-bold {methodText(selected.method)}">{selected.method}</span>
              <span class="ml-auto font-mono text-[11.5px] text-neutral-500">{selected.elapsedMs} ms · {formatBytes(selected.sizeBytes)}</span>
            </div>
            <p class="mt-2 font-mono text-[12px] break-all text-neutral-700 dark:text-neutral-300">{selected.url}</p>
            <div class="flex items-center gap-1.5 mt-2.5">
              <button class="cp-btn cp-btn-primary cp-btn-sm" onclick={() => reopen(selected)}>Open in workbench →</button>
              <button class="cp-btn cp-btn-sm cp-btn-danger" onclick={() => remove(selected)}>Delete</button>
              <span class="ml-auto cp-muted">{new Date(selected.timestamp).toLocaleString()}</span>
            </div>
          </div>
          <div class="wb-tabs !px-3">
            {#each [['response', 'Response'], ['headers', `Headers${res ? ` (${Object.keys(res.headers ?? {}).length})` : ''}`], ['request', 'Request']] as [k, label] (k)}
              <button class="wb-tab {pane === k ? 'is-active' : ''}" onclick={() => (pane = k as typeof pane)}>{label}</button>
            {/each}
          </div>
          <div class="cp-scroll p-4">
            {#if pane === 'response'}
              {#if !res}
                <p class="cp-muted">The response body was not stored for this entry.</p>
              {:else if res.error}
                <p class="text-[12.5px] text-rose-600 dark:text-rose-400 whitespace-pre-wrap">{res.error}</p>
              {:else}
                <pre class="text-[12px] font-mono whitespace-pre-wrap break-all text-neutral-700 dark:text-neutral-300">{pretty(res.body) || '(empty body)'}</pre>
                {#if res.truncated}<p class="cp-muted mt-2">Body truncated.</p>{/if}
              {/if}
            {:else if pane === 'headers'}
              {#if res && Object.keys(res.headers ?? {}).length}
                <dl class="cp-kv">
                  {#each Object.entries(res.headers) as [k, v] (k)}<dt>{k}</dt><dd>{v}</dd>{/each}
                </dl>
              {:else}
                <p class="cp-muted">No response headers stored.</p>
              {/if}
            {:else}
              {@const rq = selected.request}
              <h4 class="cp-eyebrow mb-2">Headers</h4>
              {#if rq.headers.filter((x) => x.key && x.enabled).length}
                <dl class="cp-kv">
                  {#each rq.headers.filter((x) => x.key && x.enabled) as x (x.id)}<dt>{x.key}</dt><dd>{x.value}</dd>{/each}
                </dl>
              {:else}
                <p class="cp-muted">None</p>
              {/if}
              <h4 class="cp-eyebrow mt-5 mb-2">Body · {rq.body.type}</h4>
              {#if rq.body.type === 'json'}
                <pre class="text-[12px] font-mono whitespace-pre-wrap break-all">{rq.body.rawJson}</pre>
              {:else if rq.body.type === 'text' || rq.body.type === 'xml'}
                <pre class="text-[12px] font-mono whitespace-pre-wrap break-all">{rq.body.rawText}</pre>
              {:else if rq.body.type === 'none'}
                <p class="cp-muted">No body</p>
              {:else}
                <p class="cp-muted">{rq.body.type} body — open in the workbench to see the fields.</p>
              {/if}
            {/if}
          </div>
        {:else}
          <div class="cp-empty flex-1">
            <p class="cp-muted">Select a request to see its response here.</p>
          </div>
        {/if}
      </aside>
    </div>
  {/if}
</div>
