<script lang="ts">
  import { getWorkbench } from '$lib/stores/workbench.svelte';
  import { isPro } from '$lib/stores/billing.svelte';
  import { proGate } from '$lib/stores/proGate.svelte';
  import { showToast } from '$lib/stores/uiNotifications.svelte';
  import PageHead from '$lib/components/page/PageHead.svelte';
  import { methodText, methodShort, statusTone } from '$lib/ui/http';

  const wb = getWorkbench();
  let selectedCollectionId = $state<string>(wb.collections[0]?.id || '');
  let iterations = $state<number>(1);
  let delayMs = $state<number>(50);
  let isRunning = $state<boolean>(false);
  let currentIteration = $state<number>(0);
  let totalSteps = $state<number>(0);
  let completedSteps = $state<number>(0);
  let onlyFailed = $state(false);

  interface RunResult {
    iteration: number;
    requestName: string;
    method: string;
    status: number;
    latencyMs: number;
    passed: boolean;
    testsPassed: number;
    testsTotal: number;
    error?: string;
  }

  let results = $state<RunResult[]>([]);

  const selectedCollection = $derived(wb.collections.find((c) => c.id === selectedCollectionId) || null);
  const FREE_MSG =
    'Free plan dibatasi maksimal 10 iterasi per batch run. Dapatkan lisensi CAPost PRO untuk menjalankan batch runner tanpa batas dan integrasi CI/CD.';

  function handleIterationChange(e: Event) {
    const val = parseInt((e.target as HTMLInputElement).value) || 1;
    if (!$isPro && val > 10) {
      iterations = 10;
      showToast('Free tier dibatasi maksimal 10 iterasi. Upgrade ke PRO untuk iterasi tak terbatas.', 'info');
      proGate.open('Unlimited Collection Runner', FREE_MSG);
    } else {
      iterations = Math.max(1, val);
    }
  }

  async function runBatch() {
    if (!selectedCollection || selectedCollection.requests.length === 0) {
      showToast('Pilih koleksi yang memiliki setidaknya satu request', 'error');
      return;
    }
    if (!$isPro && iterations > 10) iterations = 10;

    isRunning = true;
    results = [];
    currentIteration = 0;
    completedSteps = 0;
    totalSteps = iterations * selectedCollection.requests.length;

    for (let i = 1; i <= iterations; i++) {
      currentIteration = i;
      for (const req of selectedCollection.requests) {
        if (!isRunning) break;
        const start = performance.now();
        let status = 0;
        let passed = false;
        let testsPassed = 0;
        let testsTotal = 0;
        let error: string | undefined;
        try {
          const r = await wb.runRequest(req, selectedCollection.id, i - 1);
          status = r.response.status;
          error = r.response.error ?? r.report.errors[0]?.message;
          const counted = r.report.tests.filter((x) => !x.skipped);
          testsTotal = counted.length;
          testsPassed = counted.filter((x) => x.passed).length;
          // Postman semantics: tests decide pass/fail; without tests, fall back to HTTP status.
          passed = !r.response.error && r.report.errors.length === 0 && (testsTotal ? testsPassed === testsTotal : status > 0 && status < 400);
        } catch (e: any) {
          error = e?.message ?? String(e);
        }
        results.push({
          iteration: i,
          requestName: [...(req.folder ?? []), req.name || 'Request'].join(' / '),
          method: req.method,
          status,
          latencyMs: Math.round(performance.now() - start),
          passed,
          testsPassed,
          testsTotal,
          error
        });
        completedSteps++;
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    isRunning = false;
    showToast(`Runner selesai: ${completedSteps} request dieksekusi`, 'success');
  }

  function stopRunner() {
    isRunning = false;
    showToast('Runner dihentikan oleh pengguna', 'info');
  }

  const passedCount = $derived(results.filter((r) => r.passed).length);
  const failedCount = $derived(results.filter((r) => !r.passed).length);
  const avgLatency = $derived(results.length ? Math.round(results.reduce((acc, r) => acc + r.latencyMs, 0) / results.length) : 0);
  const shown = $derived(onlyFailed ? results.filter((r) => !r.passed) : results);
  const pct = $derived(totalSteps ? Math.round((completedSteps / totalSteps) * 100) : 0);
</script>

<div class="cp-view">
  <PageHead title="Collection Runner" subtitle="Run every request in a collection with its scripts and tests, for one or more iterations">
    {#snippet actions()}
      {#if $isPro}
        <span class="cp-pill !h-7 !px-2.5 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 font-sans">★ PRO · unlimited iterations</span>
      {:else}
        <button class="cp-btn" onclick={() => proGate.open('Unlimited Batch Runner', FREE_MSG)}>
          <span class="text-amber-500">●</span> Free · max 10 iterations
          <span class="text-brand-600 dark:text-brand-400 font-semibold">Upgrade</span>
        </button>
      {/if}
    {/snippet}
  </PageHead>

  <div class="cp-body">
    <!-- configuration -->
    <aside class="cp-side cp-pane w-80">
      <div class="p-4 space-y-4 border-b border-neutral-200 dark:border-neutral-800">
        <div>
          <label for="runner-collection" class="cp-label">Collection</label>
          <select id="runner-collection" class="cp-input" bind:value={selectedCollectionId} disabled={isRunning}>
            {#each wb.collections as c (c.id)}
              <option value={c.id}>{c.name} ({c.requests.length})</option>
            {/each}
            {#if wb.collections.length === 0}
              <option value="" disabled>Belum ada koleksi tersimpan</option>
            {/if}
          </select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="runner-iterations" class="cp-label flex justify-between">
              Iterations
              <span class="font-normal {$isPro ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-400'}">{$isPro ? '∞' : 'max 10'}</span>
            </label>
            <input id="runner-iterations" type="number" min="1" max={!$isPro ? 10 : 10000} value={iterations} oninput={handleIterationChange} disabled={isRunning} class="cp-input font-mono" />
          </div>
          <div>
            <label for="runner-delay" class="cp-label">Delay (ms)</label>
            <input id="runner-delay" type="number" min="0" step="50" bind:value={delayMs} disabled={isRunning} class="cp-input font-mono" />
          </div>
        </div>
        {#if isRunning}
          <button class="cp-btn w-full !bg-rose-600 !border-rose-600 !text-white hover:!bg-rose-500" onclick={stopRunner}>■ Stop</button>
        {:else}
          <button class="cp-btn cp-btn-primary w-full" onclick={runBatch} disabled={!selectedCollection || selectedCollection.requests.length === 0}>
            ▶ Run {selectedCollection ? selectedCollection.requests.length * iterations : 0} requests
          </button>
        {/if}
      </div>
      <div class="cp-pane-head !h-9 !text-[11px] !font-medium uppercase tracking-wider !text-neutral-500">Run order</div>
      <div class="cp-scroll px-1.5 py-1">
        {#each selectedCollection?.requests ?? [] as r, i (r.id)}
          <div class="flex items-center gap-2 h-7 px-2.5 text-[12px]">
            <span class="w-5 text-right font-mono text-[10.5px] text-neutral-400">{i + 1}</span>
            <span class="w-10 shrink-0 font-mono text-[10.5px] font-bold {methodText(r.method)}">{methodShort(r.method)}</span>
            <span class="flex-1 min-w-0 truncate text-neutral-700 dark:text-neutral-300">{[...(r.folder ?? []), r.name].join(' / ')}</span>
          </div>
        {:else}
          <p class="px-3 py-4 cp-muted">Pick a collection with requests.</p>
        {/each}
      </div>
    </aside>

    <!-- results -->
    <section class="cp-pane flex-1">
      {#if !isRunning && results.length === 0}
        <div class="cp-empty flex-1">
          <div class="cp-empty-icon">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path d="M5 4l14 8-14 8V4z" /></svg>
          </div>
          <p class="text-[13px] font-medium text-neutral-800 dark:text-neutral-200">No run yet</p>
          <p class="cp-muted max-w-sm">Requests run in order with their pre-request scripts and tests. Variables set by one request are available to the next.</p>
        </div>
      {:else}
        <div class="shrink-0 grid grid-cols-4 border-b border-neutral-200 dark:border-neutral-800 divide-x divide-neutral-200 dark:divide-neutral-800">
          {#each [
            { k: 'Executed', v: `${completedSteps}/${totalSteps}`, cls: '' },
            { k: 'Passed', v: String(passedCount), cls: 'text-emerald-600 dark:text-emerald-400' },
            { k: 'Failed', v: String(failedCount), cls: failedCount ? 'text-rose-600 dark:text-rose-400' : '' },
            { k: 'Avg latency', v: `${avgLatency} ms`, cls: '' }
          ] as s (s.k)}
            <div class="px-5 py-3">
              <div class="cp-eyebrow">{s.k}</div>
              <div class="mt-1 text-[20px] leading-tight font-semibold tabular-nums text-neutral-900 dark:text-white {s.cls}">{s.v}</div>
            </div>
          {/each}
        </div>
        <div class="h-1 shrink-0 bg-neutral-100 dark:bg-white/[0.05]">
          <div class="h-full bg-brand-500 transition-all duration-200" style="width:{pct}%"></div>
        </div>
        <div class="cp-pane-head">
          <span>Results <span class="font-normal text-neutral-500">· iteration {currentIteration} of {iterations} · {pct}%</span></span>
          <label class="flex items-center gap-1.5 font-normal cp-muted cursor-pointer">
            <input type="checkbox" class="accent-brand-600" bind:checked={onlyFailed} /> Failed only
          </label>
        </div>
        <div class="cp-scroll">
          <table class="cp-table">
            <thead class="sticky top-0 z-[1]">
              <tr>
                <th class="w-14">Iter</th>
                <th class="w-16">Method</th>
                <th>Request</th>
                <th class="w-20">Status</th>
                <th class="w-24 text-right">Latency</th>
                <th class="w-20 text-right">Tests</th>
                <th class="w-20 text-right">Result</th>
              </tr>
            </thead>
            <tbody>
              {#each shown as r, idx (idx)}
                <tr>
                  <td class="font-mono text-[11.5px] text-neutral-400">#{r.iteration}</td>
                  <td class="font-mono text-[11px] font-bold {methodText(r.method)}">{methodShort(r.method)}</td>
                  <td class="max-w-0">
                    <div class="truncate text-neutral-800 dark:text-neutral-200">{r.requestName}</div>
                    {#if r.error}<div class="truncate text-[11px] text-rose-500" title={r.error}>{r.error}</div>{/if}
                  </td>
                  <td><span class="cp-pill {statusTone(r.status)}">{r.status || 'ERR'}</span></td>
                  <td class="text-right font-mono text-[11.5px] text-neutral-500">{r.latencyMs} ms</td>
                  <td class="text-right font-mono text-[11.5px] {r.testsTotal && r.testsPassed < r.testsTotal ? 'text-rose-500' : 'text-neutral-500'}">
                    {r.testsTotal ? `${r.testsPassed}/${r.testsTotal}` : '—'}
                  </td>
                  <td class="text-right">
                    <span class="cp-pill font-sans {r.passed ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/12 text-rose-600 dark:text-rose-400'}">{r.passed ? 'PASS' : 'FAIL'}</span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  </div>
</div>
