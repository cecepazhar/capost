<script lang="ts">
  import { getWorkbench, newRequest, type HistoryEntry } from '$lib/stores/workbench.svelte';
  import { goto } from '$app/navigation';
  import PageHead from '$lib/components/page/PageHead.svelte';
  import { methodText, methodShort, methodBar, statusTone, timeAgo } from '$lib/ui/http';
  import { importFromFiles } from '$lib/ui/transfer';

  const wb = getWorkbench();
  const history = $derived(wb.history);
  const collections = $derived(wb.collections);
  const environments = $derived(wb.environments);

  const total = $derived(history.length);
  const ok = $derived(history.filter((h) => h.status > 0 && h.status < 400).length);
  const successRate = $derived(total ? Math.round((ok / total) * 100) : 0);
  const latencies = $derived(history.map((h) => h.elapsedMs || 0).sort((a, b) => a - b));
  const p50 = $derived(latencies.length ? latencies[Math.floor((latencies.length - 1) * 0.5)] : 0);
  const p95 = $derived(latencies.length ? latencies[Math.floor((latencies.length - 1) * 0.95)] : 0);
  const endpoints = $derived(collections.reduce((n, c) => n + c.requests.length, 0));
  const today = $derived(history.filter((h) => Date.now() - h.timestamp < 86_400_000).length);

  const methodMix = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const h of history) counts.set(h.method, (counts.get(h.method) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([method, count]) => ({ method, count, pct: total ? (count / total) * 100 : 0 }));
  });
  const statusMix = $derived([
    { label: '2xx / 3xx', count: ok, cls: 'bg-emerald-500' },
    { label: '4xx', count: history.filter((h) => h.status >= 400 && h.status < 500).length, cls: 'bg-amber-500' },
    { label: '5xx / error', count: history.filter((h) => !h.status || h.status >= 500).length, cls: 'bg-rose-500' }
  ]);

  function open(h: HistoryEntry) {
    wb.newTab({ ...JSON.parse(JSON.stringify(h.request)), id: crypto.randomUUID() }, { id: `hist:${h.id}`, collectionId: null }, { preview: true, response: h.response ?? null });
    goto('/requests');
  }
  function startRequest() {
    wb.newTab(newRequest());
    goto('/requests');
  }
  async function doImport() {
    const r = await importFromFiles();
    if (r.some((x) => x.collections)) goto('/collections');
  }
</script>

<div class="cp-page">
  <PageHead title="Overview" subtitle="Your workspace at a glance — recent traffic, collections and environments.">
    {#snippet actions()}
      <button class="cp-btn" onclick={doImport}>
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></svg>
        Import
      </button>
      <button class="cp-btn" onclick={() => goto('/runner')}>Runner</button>
      <button class="cp-btn cp-btn-primary" onclick={startRequest}>
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14" /></svg>
        New request
      </button>
    {/snippet}
  </PageHead>

  {#if total === 0 && collections.length === 0}
    <!-- First run: guide instead of empty charts -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      {#each [
        { t: 'Send your first request', d: 'Open the workbench, paste a URL or a cURL command and press Ctrl+Enter.', a: 'New request', f: startRequest, i: 'M5 12h14M13 6l6 6-6 6' },
        { t: 'Bring your Postman work', d: 'Import collections (v2 / v2.1), environments and globals — folders, auth and scripts included.', a: 'Import file', f: doImport, i: 'M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2' },
        { t: 'Set up environments', d: 'Keep base URLs and tokens per stage and switch with one click.', a: 'Environments', f: () => goto('/environments'), i: 'M4 6h16M4 12h10M4 18h6' }
      ] as card (card.t)}
        <div class="cp-card cp-card-body flex flex-col gap-2">
          <div class="h-9 w-9 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
            <svg class="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d={card.i} /></svg>
          </div>
          <h3 class="text-[13px] font-semibold text-neutral-900 dark:text-white mt-1">{card.t}</h3>
          <p class="cp-muted flex-1">{card.d}</p>
          <button class="cp-btn cp-btn-sm self-start mt-1" onclick={card.f}>{card.a} →</button>
        </div>
      {/each}
    </div>
  {/if}

  <!-- KPIs -->
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
    {#each [
      { k: 'Requests sent', v: String(total), s: `${today} in the last 24 h` },
      { k: 'Success rate', v: total ? `${successRate}%` : '—', s: total ? `${ok} of ${total} below 400` : 'No traffic yet', tone: total ? (successRate >= 90 ? 'text-emerald-600 dark:text-emerald-400' : successRate >= 70 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400') : '' },
      { k: 'Latency p50', v: total ? `${p50} ms` : '—', s: total ? `p95 ${p95} ms` : 'Median round-trip' },
      { k: 'Collections', v: String(collections.length), s: `${endpoints} requests · ${environments.length} envs` }
    ] as kpi (kpi.k)}
      <div class="cp-card px-4 py-3.5">
        <div class="cp-eyebrow">{kpi.k}</div>
        <div class="mt-1.5 text-[22px] leading-none font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-white {kpi.tone ?? ''}">{kpi.v}</div>
        <div class="mt-1.5 text-[11.5px] text-neutral-500 dark:text-neutral-400">{kpi.s}</div>
      </div>
    {/each}
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5">
    <!-- Recent activity -->
    <section class="cp-card overflow-hidden">
      <div class="cp-card-head">
        <h2 class="cp-card-title">Recent activity</h2>
        {#if total}<a href="/history" class="wb-link">View all →</a>{/if}
      </div>
      {#if total === 0}
        <div class="cp-empty">
          <p class="cp-muted">Requests you send will appear here.</p>
          <button class="cp-btn cp-btn-sm mt-1" onclick={startRequest}>Send a request</button>
        </div>
      {:else}
        {#each history.slice(0, 8) as h (h.id)}
          <button class="cp-row w-full text-left" onclick={() => open(h)} title="Reopen in workbench">
            <span class="cp-pill w-11 justify-center shrink-0 {statusTone(h.status)}">{h.status || 'ERR'}</span>
            <span class="w-11 shrink-0 font-mono text-[11px] font-bold {methodText(h.method)}">{methodShort(h.method)}</span>
            <span class="flex-1 min-w-0 truncate font-mono text-[12px] text-neutral-700 dark:text-neutral-300">{h.url}</span>
            <span class="w-16 shrink-0 text-right font-mono text-[11.5px] text-neutral-500">{h.elapsedMs} ms</span>
            <span class="w-16 shrink-0 text-right text-[11.5px] text-neutral-400">{timeAgo(h.timestamp)}</span>
          </button>
        {/each}
      {/if}
    </section>

    <div class="flex flex-col gap-5">
      <!-- Environment -->
      <section class="cp-card">
        <div class="cp-card-head">
          <h2 class="cp-card-title">Environment</h2>
          <a href="/environments" class="wb-link">Manage →</a>
        </div>
        <div class="cp-card-body space-y-2">
          <select class="cp-input" value={wb.activeEnvironmentId ?? ''} onchange={(e) => wb.setActiveEnvironment((e.target as HTMLSelectElement).value || null)} aria-label="Active environment">
            <option value="">No environment</option>
            {#each environments as env (env.id)}
              <option value={env.id}>{env.name}</option>
            {/each}
          </select>
          <p class="cp-muted">
            {wb.activeEnvironment ? `${wb.activeEnvironment.variables.filter((v) => v.enabled).length} active variables` : 'Requests resolve only globals and collection variables.'}
          </p>
        </div>
      </section>

      <!-- Collections -->
      <section class="cp-card overflow-hidden">
        <div class="cp-card-head">
          <h2 class="cp-card-title">Collections</h2>
          <a href="/collections" class="wb-link">All →</a>
        </div>
        {#if collections.length === 0}
          <p class="cp-card-body cp-muted">No collections yet.</p>
        {:else}
          {#each collections.slice(0, 5) as c (c.id)}
            <a href="/collections" class="cp-row">
              <svg class="w-4 h-4 shrink-0 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
              <span class="flex-1 truncate text-[12.5px]">{c.name}</span>
              <span class="text-[11px] font-mono text-neutral-400">{c.requests.length}</span>
            </a>
          {/each}
        {/if}
      </section>

      <!-- Traffic mix -->
      {#if total}
        <section class="cp-card">
          <div class="cp-card-head"><h2 class="cp-card-title">Traffic mix</h2></div>
          <div class="cp-card-body space-y-4">
            <div>
              <div class="cp-eyebrow mb-2">Status</div>
              <div class="flex h-2 rounded-full overflow-hidden bg-neutral-100 dark:bg-white/[0.06]">
                {#each statusMix as s (s.label)}
                  {#if s.count}<div class={s.cls} style="width:{(s.count / total) * 100}%"></div>{/if}
                {/each}
              </div>
              <div class="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11.5px] text-neutral-500">
                {#each statusMix as s (s.label)}
                  <span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-sm {s.cls}"></span>{s.label} <span class="font-mono">{s.count}</span></span>
                {/each}
              </div>
            </div>
            <div>
              <div class="cp-eyebrow mb-2">Methods</div>
              <div class="space-y-1.5">
                {#each methodMix as m (m.method)}
                  <div class="flex items-center gap-2 text-[11.5px]">
                    <span class="w-11 font-mono font-bold {methodText(m.method)}">{methodShort(m.method)}</span>
                    <div class="flex-1 h-1.5 rounded-full bg-neutral-100 dark:bg-white/[0.06] overflow-hidden">
                      <div class="h-full rounded-full {methodBar(m.method)}" style="width:{m.pct}%"></div>
                    </div>
                    <span class="w-8 text-right font-mono text-neutral-500">{m.count}</span>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        </section>
      {/if}
    </div>
  </div>
</div>
