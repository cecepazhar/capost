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
  const sorted = $derived(history.map((h) => h.elapsedMs || 0).sort((a, b) => a - b));
  const pct = (p: number) => (sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : 0);
  const p50 = $derived(pct(0.5));
  const p95 = $derived(pct(0.95));
  const endpoints = $derived(collections.reduce((n, c) => n + c.requests.length, 0));
  const today = $derived(history.filter((h) => Date.now() - h.timestamp < 86_400_000).length);

  // Latency timeline: last 60 requests, oldest on the left, bar colour = status class.
  const timeline = $derived(history.slice(0, 60).reverse());
  const scaleMax = $derived(Math.max(1, ...timeline.map((h) => h.elapsedMs || 0)));
  const barTone = (s: number) => (!s || s >= 500 ? 'bg-rose-500' : s >= 400 ? 'bg-amber-500' : 'bg-brand-500');

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
  const topHosts = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const h of history) {
      let host = h.url;
      try {
        host = new URL(h.url).host;
      } catch {
        host = h.url.replace(/^\w+:\/\//, '').split('/')[0];
      }
      counts.set(host, (counts.get(host) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  });

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

  const kpis = $derived([
    { k: 'Requests sent', v: String(total), s: `${today} in the last 24 h` },
    {
      k: 'Success rate',
      v: total ? `${successRate}%` : '—',
      s: total ? `${ok} of ${total} below 400` : 'No traffic yet',
      tone: total ? (successRate >= 90 ? 'text-emerald-600 dark:text-emerald-400' : successRate >= 70 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400') : ''
    },
    { k: 'Latency p50', v: total ? `${p50} ms` : '—', s: 'Median round-trip' },
    { k: 'Latency p95', v: total ? `${p95} ms` : '—', s: 'Slowest 5% start here' },
    { k: 'Collections', v: String(collections.length), s: `${endpoints} saved requests` },
    { k: 'Environments', v: String(environments.length), s: wb.activeEnvironment ? `Active: ${wb.activeEnvironment.name}` : 'None active' }
  ]);
</script>

<div class="cp-view">
  <PageHead title="Overview" subtitle="Recent traffic, collections and environments in this workspace">
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

  <!-- KPI strip: one row across the full width, separated by hairlines like a status bar -->
  <div class="shrink-0 grid grid-cols-3 xl:grid-cols-6 border-b border-neutral-200 dark:border-neutral-800 divide-x divide-neutral-200 dark:divide-neutral-800">
    {#each kpis as kpi (kpi.k)}
      <div class="px-5 py-3.5 min-w-0">
        <div class="cp-eyebrow truncate">{kpi.k}</div>
        <div class="mt-1 text-[20px] leading-tight font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-white truncate {kpi.tone ?? ''}">{kpi.v}</div>
        <div class="mt-0.5 text-[11.5px] text-neutral-500 dark:text-neutral-400 truncate">{kpi.s}</div>
      </div>
    {/each}
  </div>

  <div class="cp-body">
    <!-- main column -->
    <div class="cp-pane flex-1">
      <!-- latency timeline -->
      <section class="shrink-0 border-b border-neutral-200 dark:border-neutral-800">
        <div class="cp-pane-head !border-b-0">
          <span>Latency · last {timeline.length || 60} requests</span>
          {#if total}
            <span class="flex items-center gap-3 font-normal text-[11px] text-neutral-500">
              <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-brand-500"></span>2xx/3xx</span>
              <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-amber-500"></span>4xx</span>
              <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-rose-500"></span>5xx/error</span>
            </span>
          {/if}
        </div>
        {#if total === 0}
          <!-- First run: guide instead of an empty chart -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-px bg-neutral-200 dark:bg-neutral-800 border-t border-neutral-200 dark:border-neutral-800">
            {#each [
              { t: 'Send your first request', d: 'Paste a URL or a cURL command in the workbench and press Ctrl+Enter.', a: 'New request', f: startRequest, i: 'M5 12h14M13 6l6 6-6 6' },
              { t: 'Bring your Postman work', d: 'Import collections (v2 / v2.1), environments and globals — folders, auth and scripts included.', a: 'Import file', f: doImport, i: 'M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2' },
              { t: 'Set up environments', d: 'Keep base URLs and tokens per stage and switch with one click.', a: 'Environments', f: () => goto('/environments'), i: 'M4 6h16M4 12h10M4 18h6' }
            ] as card (card.t)}
              <div class="bg-white dark:bg-[#161616] p-5 flex flex-col gap-2">
                <div class="h-9 w-9 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d={card.i} /></svg>
                </div>
                <h3 class="text-[13px] font-semibold text-neutral-900 dark:text-white mt-1">{card.t}</h3>
                <p class="cp-muted flex-1">{card.d}</p>
                <button class="cp-btn cp-btn-sm self-start mt-1" onclick={card.f}>{card.a} →</button>
              </div>
            {/each}
          </div>
        {:else}
          <div class="px-4 pb-4">
            <div class="relative h-36 flex items-end gap-[3px] border-b border-l border-neutral-200 dark:border-neutral-800 pl-1">
              <span class="absolute -top-0.5 left-1.5 text-[10.5px] font-mono text-neutral-400">{scaleMax} ms</span>
              <div class="absolute inset-x-0 top-1/2 border-t border-dashed border-neutral-200 dark:border-neutral-800"></div>
              {#each timeline as h (h.id)}
                <button
                  class="relative flex-1 max-w-[28px] min-w-[3px] rounded-t-sm opacity-80 hover:opacity-100 transition-opacity {barTone(h.status)}"
                  style="height:{Math.max(3, ((h.elapsedMs || 0) / scaleMax) * 100)}%"
                  title={`${h.method} ${h.url}\n${h.status || 'ERR'} · ${h.elapsedMs} ms · ${timeAgo(h.timestamp)}`}
                  aria-label={`${h.method} ${h.url}, ${h.elapsedMs} ms`}
                  onclick={() => open(h)}
                ></button>
              {/each}
            </div>
            <div class="flex justify-between mt-1 text-[10.5px] font-mono text-neutral-400">
              <span>older</span><span>p50 {p50} ms · p95 {p95} ms</span><span>latest</span>
            </div>
          </div>
        {/if}
      </section>

      <!-- recent activity fills the rest -->
      <div class="cp-pane-head">
        <span>Recent activity</span>
        {#if total}<a href="/history" class="wb-link font-normal">View all →</a>{/if}
      </div>
      <div class="cp-scroll">
        {#if total === 0}
          <div class="cp-empty">
            <p class="cp-muted">Requests you send will appear here.</p>
          </div>
        {:else}
          {#each history.slice(0, 50) as h (h.id)}
            <button class="cp-row w-full text-left" onclick={() => open(h)} title="Reopen in workbench">
              <span class="cp-pill w-11 justify-center shrink-0 {statusTone(h.status)}">{h.status || 'ERR'}</span>
              <span class="w-11 shrink-0 font-mono text-[11px] font-bold {methodText(h.method)}">{methodShort(h.method)}</span>
              <span class="flex-1 min-w-0 truncate font-mono text-[12px] text-neutral-700 dark:text-neutral-300">{h.url}</span>
              <span class="w-20 shrink-0 text-right font-mono text-[11.5px] text-neutral-500">{h.elapsedMs} ms</span>
              <span class="w-20 shrink-0 text-right text-[11.5px] text-neutral-400">{timeAgo(h.timestamp)}</span>
            </button>
          {/each}
        {/if}
      </div>
    </div>

    <!-- side column -->
    <aside class="cp-side cp-pane w-[340px] !border-r-0 border-l border-neutral-200 dark:border-neutral-800 hidden lg:flex">
      <div class="cp-scroll">
        <section class="border-b border-neutral-200 dark:border-neutral-800">
          <div class="cp-pane-head !border-b-0">
            <span>Environment</span>
            <a href="/environments" class="wb-link font-normal">Manage →</a>
          </div>
          <div class="px-4 pb-4 space-y-2">
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

        <section class="border-b border-neutral-200 dark:border-neutral-800">
          <div class="cp-pane-head !border-b-0">
            <span>Collections</span>
            <a href="/collections" class="wb-link font-normal">All →</a>
          </div>
          <div class="px-2 pb-3">
            {#each collections.slice(0, 8) as c (c.id)}
              <a href="/collections?id={c.id}" class="cp-list-item">
                <svg class="w-4 h-4 shrink-0 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
                <span class="flex-1 truncate">{c.name}</span>
                <span class="text-[11px] font-mono text-neutral-400">{c.requests.length}</span>
              </a>
            {:else}
              <p class="px-2.5 cp-muted">No collections yet.</p>
            {/each}
          </div>
        </section>

        {#if total}
          <section class="border-b border-neutral-200 dark:border-neutral-800">
            <div class="cp-pane-head !border-b-0"><span>Status</span></div>
            <div class="px-4 pb-4">
              <div class="flex h-2 rounded-full overflow-hidden bg-neutral-200/70 dark:bg-white/[0.06]">
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
          </section>

          <section class="border-b border-neutral-200 dark:border-neutral-800">
            <div class="cp-pane-head !border-b-0"><span>Methods</span></div>
            <div class="px-4 pb-4 space-y-1.5">
              {#each methodMix as m (m.method)}
                <div class="flex items-center gap-2 text-[11.5px]">
                  <span class="w-11 font-mono font-bold {methodText(m.method)}">{methodShort(m.method)}</span>
                  <div class="flex-1 h-1.5 rounded-full bg-neutral-200/70 dark:bg-white/[0.06] overflow-hidden">
                    <div class="h-full rounded-full {methodBar(m.method)}" style="width:{m.pct}%"></div>
                  </div>
                  <span class="w-8 text-right font-mono text-neutral-500">{m.count}</span>
                </div>
              {/each}
            </div>
          </section>

          <section>
            <div class="cp-pane-head !border-b-0"><span>Top hosts</span></div>
            <div class="px-4 pb-4 space-y-1.5">
              {#each topHosts as [host, count] (host)}
                <div class="flex items-center gap-2 text-[12px]">
                  <span class="flex-1 truncate font-mono text-neutral-700 dark:text-neutral-300">{host}</span>
                  <span class="font-mono text-[11px] text-neutral-500">{count}</span>
                </div>
              {/each}
            </div>
          </section>
        {/if}
      </div>
    </aside>
  </div>
</div>
