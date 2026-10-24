<script lang="ts">
  import { PageContainer, PageHeader } from '@cecepazhar/caui';
  import { t } from '$lib/i18n/index.svelte';
  import { getWorkbench, type CollectionItem, type WorkbenchRequest } from '$lib/stores/workbench.svelte';
  import { isPro } from '$lib/stores/billing.svelte';
  import { proGate } from '$lib/stores/proGate.svelte';
  import { showToast } from '$lib/stores/uiNotifications.svelte';
  import { invoke } from '@tauri-apps/api/core';

  const wb = getWorkbench();
  let selectedCollectionId = $state<string>(wb.collections[0]?.id || '');
  let iterations = $state<number>(1);
  let delayMs = $state<number>(50);
  let isRunning = $state<boolean>(false);
  let currentIteration = $state<number>(0);
  let totalSteps = $state<number>(0);
  let completedSteps = $state<number>(0);

  interface RunResult {
    iteration: number;
    requestName: string;
    method: string;
    status: number;
    latencyMs: number;
    passed: boolean;
  }

  let results = $state<RunResult[]>([]);

  const selectedCollection = $derived(
    wb.collections.find((c) => c.id === selectedCollectionId) || null
  );

  function handleIterationChange(e: Event) {
    const val = parseInt((e.target as HTMLInputElement).value) || 1;
    if (!$isPro && val > 10) {
      iterations = 10;
      showToast('Free tier dibatasi maksimal 10 iterasi. Upgrade ke PRO untuk iterasi tak terbatas.', 'info');
      proGate.open(
        'Unlimited Collection Runner',
        'Free plan dibatasi maksimal 10 iterasi per batch run. Dapatkan lisensi CAPost PRO untuk menjalankan batch runner tanpa batas dan integrasi CI/CD.'
      );
    } else {
      iterations = Math.max(1, val);
    }
  }

  async function runBatch() {
    if (!selectedCollection || selectedCollection.requests.length === 0) {
      showToast('Pilih koleksi yang memiliki setidaknya satu request', 'error');
      return;
    }

    if (!$isPro && iterations > 10) {
      iterations = 10;
    }

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
        let status = 200;
        let passed = true;

        try {
          const resp = await invoke<any>('http_send_request', {
            payload: {
              method: req.method,
              url: req.url || 'https://httpbin.org/get',
              headers: req.headers.filter((h) => h.enabled).map((h) => [h.key, h.value]),
              body: req.body.type === 'raw-json' ? req.body.rawJson : null,
              timeout_ms: 10000
            }
          });
          status = resp.status_code || 200;
          passed = status < 400;
        } catch {
          status = 500;
          passed = false;
        }

        const elapsed = Math.round(performance.now() - start);

        results.push({
          iteration: i,
          requestName: req.name || 'Request',
          method: req.method,
          status,
          latencyMs: elapsed,
          passed
        });

        completedSteps++;
        if (delayMs > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
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
  const avgLatency = $derived(
    results.length ? Math.round(results.reduce((acc, r) => acc + r.latencyMs, 0) / results.length) : 0
  );
</script>

<PageContainer class="p-6 space-y-6 max-w-7xl mx-auto">
  <div class="flex items-center justify-between">
    <PageHeader
      title={t('nav.runner')}
      subtitle="Automated collection runner, iteration assertions and performance stats"
      accent="indigo"
    />

    <!-- Pro Limit Status Indicator -->
    {#if $isPro}
      <div class="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.35)] select-none">
        <span>★</span>
        <span>PRO: Iterasi Tak Terbatas</span>
      </div>
    {:else}
      <button
        type="button"
        onclick={() =>
          proGate.open(
            'Unlimited Batch Runner',
            'Free plan dibatasi maksimal 10 iterasi per batch run. Dapatkan lisensi CAPost PRO untuk menjalankan batch runner tanpa batas dan integrasi CI/CD.'
          )}
        class="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700/80 border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 transition-all cursor-pointer group"
      >
        <span class="text-amber-500">○</span>
        <span>FREE: Maks 10 Iterasi</span>
        <span class="text-[10px] font-bold uppercase px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
          Upgrade
        </span>
      </button>
    {/if}
  </div>

  <!-- Runner Setup Form -->
  <div class="bg-white dark:bg-[#121217] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-xs space-y-5">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <!-- Collection selector -->
      <div>
        <label for="runner-collection" class="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
          Collection
        </label>
        <select
          id="runner-collection"
          bind:value={selectedCollectionId}
          disabled={isRunning}
          class="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl text-xs font-medium text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        >
          {#each wb.collections as c (c.id)}
            <option value={c.id}>{c.name} ({c.requests.length} requests)</option>
          {/each}
          {#if wb.collections.length === 0}
            <option value="" disabled>Belum ada koleksi tersimpan</option>
          {/if}
        </select>
      </div>

      <!-- Iterations input -->
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <label for="runner-iterations" class="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
            Iterations
          </label>
          {#if !$isPro}
            <span class="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">Max 10 (Free Plan)</span>
          {:else}
            <span class="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">Unlimited (PRO)</span>
          {/if}
        </div>
        <div class="relative">
          <input
            id="runner-iterations"
            type="number"
            min="1"
            max={!$isPro ? 10 : 10000}
            value={iterations}
            oninput={handleIterationChange}
            disabled={isRunning}
            class="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl text-xs font-mono text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
          {#if !$isPro && iterations >= 10}
            <button
              type="button"
              onclick={() =>
                proGate.open(
                  'Unlimited Batch Runner',
                  'Free plan dibatasi maksimal 10 iterasi per batch run. Dapatkan lisensi CAPost PRO untuk menjalankan batch runner tanpa batas dan integrasi CI/CD.'
                )}
              class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
            >
              ★ Unlock &gt;10
            </button>
          {/if}
        </div>
      </div>

      <!-- Delay input -->
      <div>
        <label for="runner-delay" class="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
          Delay per Request (ms)
        </label>
        <input
          id="runner-delay"
          type="number"
          min="0"
          step="50"
          bind:value={delayMs}
          disabled={isRunning}
          class="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl text-xs font-mono text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        />
      </div>
    </div>

    <!-- Execution trigger -->
    <div class="flex items-center justify-between pt-3 border-t border-neutral-100 dark:border-neutral-800">
      <div class="text-xs text-neutral-500">
        {#if selectedCollection}
          <span>Total Request: <strong class="text-neutral-900 dark:text-white">{selectedCollection.requests.length * iterations}</strong> eksekusi</span>
        {:else}
          <span>Pilih koleksi untuk memulai</span>
        {/if}
      </div>

      <div class="flex items-center gap-2">
        {#if isRunning}
          <button
            type="button"
            onclick={stopRunner}
            class="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors shadow-sm cursor-pointer flex items-center gap-1.5"
          >
            <span>■</span>
            <span>Stop Runner</span>
          </button>
        {:else}
          <button
            type="button"
            onclick={runBatch}
            disabled={!selectedCollection || selectedCollection.requests.length === 0}
            class="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            <span>▶</span>
            <span>Run Collection</span>
          </button>
        {/if}
      </div>
    </div>
  </div>

  <!-- Progress bar -->
  {#if isRunning || results.length > 0}
    <div class="bg-white dark:bg-[#121217] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-xs space-y-4">
      <div class="flex items-center justify-between text-xs">
        <span class="font-semibold text-neutral-900 dark:text-white">
          Progress: {completedSteps} / {totalSteps} requests ({totalSteps ? Math.round((completedSteps / totalSteps) * 100) : 0}%)
        </span>
        <span class="font-mono text-neutral-500">Iteration {currentIteration} of {iterations}</span>
      </div>

      <div class="w-full h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
        <div
          class="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-200"
          style="width: {totalSteps ? (completedSteps / totalSteps) * 100 : 0}%"
        ></div>
      </div>

      <!-- Stats Summary -->
      <div class="grid grid-cols-4 gap-3 pt-2 text-center text-xs">
        <div class="p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
          <div class="text-[11px] text-neutral-400">Total</div>
          <div class="text-sm font-bold font-mono text-neutral-900 dark:text-white">{results.length}</div>
        </div>
        <div class="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <div class="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">Passed</div>
          <div class="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">{passedCount}</div>
        </div>
        <div class="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
          <div class="text-[11px] text-rose-600 dark:text-rose-400 font-semibold">Failed</div>
          <div class="text-sm font-bold font-mono text-rose-600 dark:text-rose-400">{failedCount}</div>
        </div>
        <div class="p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
          <div class="text-[11px] text-neutral-400">Avg Latency</div>
          <div class="text-sm font-bold font-mono text-neutral-900 dark:text-white">{avgLatency} ms</div>
        </div>
      </div>

      <!-- Results Table -->
      <div class="max-h-72 overflow-y-auto border border-neutral-200 dark:border-neutral-800 rounded-xl">
        <table class="w-full text-xs">
          <thead class="bg-neutral-50 dark:bg-neutral-900/80 sticky top-0 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
            <tr>
              <th class="py-2 px-3 text-left">Iter</th>
              <th class="py-2 px-3 text-left">Method</th>
              <th class="py-2 px-3 text-left">Request</th>
              <th class="py-2 px-3 text-left">Status</th>
              <th class="py-2 px-3 text-left">Latency</th>
              <th class="py-2 px-3 text-left">Result</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-100 dark:divide-neutral-800/60 font-mono text-[11px]">
            {#each results as r, idx (idx)}
              <tr class="hover:bg-neutral-50 dark:hover:bg-neutral-900/40">
                <td class="py-1.5 px-3 text-neutral-400">#{r.iteration}</td>
                <td class="py-1.5 px-3 font-bold">{r.method}</td>
                <td class="py-1.5 px-3 font-sans truncate max-w-[200px] text-neutral-800 dark:text-neutral-200">{r.requestName}</td>
                <td class="py-1.5 px-3 font-bold {r.status < 400 ? 'text-emerald-500' : 'text-rose-500'}">{r.status}</td>
                <td class="py-1.5 px-3 text-neutral-500">{r.latencyMs} ms</td>
                <td class="py-1.5 px-3 font-bold {r.passed ? 'text-emerald-500' : 'text-rose-500'}">
                  {r.passed ? 'PASS' : 'FAIL'}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</PageContainer>
