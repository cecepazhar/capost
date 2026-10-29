<script lang="ts">
  import {
    PageContainer,
    PageHeader,
    Card,
    Badge,
    Button,
    EmptyState
  } from '@cecepazhar/caui';
  import { getWorkbench, type HistoryEntry } from '$lib/stores/workbench.svelte.ts';
  import { goto } from '$app/navigation';

  const workbench = getWorkbench();

  const history = $derived(workbench.history);
  const collections = $derived(workbench.collections);
  const environments = $derived(workbench.environments);
  const activeEnv = $derived(workbench.activeEnvironment);

  const totalRequests = $derived(history.length);
  const successRequests = $derived(history.filter((h) => h.status >= 200 && h.status < 300).length);
  const successRate = $derived(totalRequests === 0 ? 0 : Math.round((successRequests / totalRequests) * 100));
  const avgLatency = $derived(
    totalRequests === 0
      ? 0
      : Math.round(history.reduce((sum, h) => sum + (h.elapsedMs || 0), 0) / totalRequests)
  );
  const totalEndpoints = $derived(collections.reduce((sum, c) => sum + (c.requests?.length || 0), 0));

  const methodList = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;
  const methodMeta: Record<string, { badgeStyle: string; barColor: string }> = {
    GET: {
      badgeStyle: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      barColor: 'bg-emerald-500'
    },
    POST: {
      badgeStyle: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
      barColor: 'bg-blue-500'
    },
    PUT: {
      badgeStyle: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
      barColor: 'bg-amber-500'
    },
    DELETE: {
      badgeStyle: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
      barColor: 'bg-red-500'
    },
    PATCH: {
      badgeStyle: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
      barColor: 'bg-purple-500'
    }
  };

  const methodBreakdown = $derived(
    methodList.map((m) => {
      const count = history.filter((h) => h.method === m).length;
      const pct = totalRequests === 0 ? 0 : Math.round((count / totalRequests) * 100);
      return {
        method: m,
        count,
        pct,
        ...methodMeta[m]
      };
    })
  );

  const statusBreakdown = $derived([
    {
      category: '2xx Success',
      code: '2xx',
      count: history.filter((h) => h.status >= 200 && h.status < 300).length,
      pct: totalRequests === 0 ? 0 : Math.round((history.filter((h) => h.status >= 200 && h.status < 300).length / totalRequests) * 100),
      barColor: 'bg-emerald-500',
      badgeVariant: 'success' as const
    },
    {
      category: '4xx Client Error',
      code: '4xx',
      count: history.filter((h) => h.status >= 400 && h.status < 500).length,
      pct: totalRequests === 0 ? 0 : Math.round((history.filter((h) => h.status >= 400 && h.status < 500).length / totalRequests) * 100),
      barColor: 'bg-amber-500',
      badgeVariant: 'warning' as const
    },
    {
      category: '5xx Server Error',
      code: '5xx',
      count: history.filter((h) => h.status >= 500).length,
      pct: totalRequests === 0 ? 0 : Math.round((history.filter((h) => h.status >= 500).length / totalRequests) * 100),
      barColor: 'bg-rose-500',
      badgeVariant: 'danger' as const
    }
  ]);

  function getMethodBadgeClass(method: string): string {
    return methodMeta[method]?.badgeStyle || 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-400 border-neutral-500/30';
  }

  function getStatusBadgeVariant(status: number): 'success' | 'warning' | 'danger' | 'outline' {
    if (status >= 200 && status < 300) return 'success';
    if (status >= 400 && status < 500) return 'warning';
    if (status >= 500) return 'danger';
    return 'outline';
  }

  function formatBytes(bytes?: number): string {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  function formatTime(timestamp: number): string {
    if (!timestamp) return 'Just now';
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function openInWorkbench(entry: HistoryEntry) {
    if (entry.request) {
      workbench.currentRequest = JSON.parse(JSON.stringify(entry.request));
    } else {
      workbench.currentRequest = {
        ...workbench.currentRequest,
        method: entry.method,
        url: entry.url
      };
    }
    goto('/requests');
  }
</script>

<PageContainer class="p-6 space-y-6 max-w-7xl mx-auto">
  <!-- Page Header -->
  <PageHeader
    title="Studio Telemetry"
    subtitle="Zero-Knowledge AI-Native API Studio & Workbench telemetry, request metrics, and vault status."
    accent="indigo"
  >
    {#snippet action()}
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" onclick={() => goto('/mock')} aria-label="Open Mock Server">
          Mock Server
        </Button>
        <Button variant="outline" size="sm" onclick={() => goto('/runner')} aria-label="Open Collection Runner">
          Collection Runner
        </Button>
        <Button variant="primary" size="sm" onclick={() => goto('/requests')} aria-label="Create New Request">
          New Request
        </Button>
      </div>
    {/snippet}
  </PageHeader>

  <!-- Dynamic KPI Metrics Grid -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <Card class="p-4 flex items-center justify-between shadow-2xs hover:border-[var(--ca-brand)] transition-colors">
      <div class="space-y-1">
        <p class="text-xs text-[var(--ca-text-muted)] font-medium">Total Requests</p>
        <p class="text-2xl font-bold font-mono tracking-tight text-[var(--ca-text-primary)]">{totalRequests}</p>
        <div class="flex items-center gap-1.5 pt-0.5">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span class="text-[11px] font-medium text-emerald-500">Recorded history</span>
        </div>
      </div>
      <div class="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-bold">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
    </Card>

    <Card class="p-4 flex items-center justify-between shadow-2xs hover:border-[var(--ca-brand)] transition-colors">
      <div class="space-y-1">
        <p class="text-xs text-[var(--ca-text-muted)] font-medium">Success Rate</p>
        <p class="text-2xl font-bold font-mono tracking-tight text-[var(--ca-text-primary)]">{successRate}%</p>
        <div class="flex items-center gap-1.5 pt-0.5">
          <span class="w-1.5 h-1.5 rounded-full {successRate >= 90 ? 'bg-emerald-500' : successRate >= 70 ? 'bg-amber-500' : 'bg-rose-500'}"></span>
          <span class="text-[11px] font-medium {successRate >= 90 ? 'text-emerald-500' : successRate >= 70 ? 'text-amber-500' : 'text-rose-500'}">2xx responses</span>
        </div>
      </div>
      <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    </Card>

    <Card class="p-4 flex items-center justify-between shadow-2xs hover:border-[var(--ca-brand)] transition-colors">
      <div class="space-y-1">
        <p class="text-xs text-[var(--ca-text-muted)] font-medium">Avg Latency</p>
        <p class="text-2xl font-bold font-mono tracking-tight text-[var(--ca-text-primary)]">{avgLatency}ms</p>
        <div class="flex items-center gap-1.5 pt-0.5">
          <span class="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>
          <span class="text-[11px] font-medium text-cyan-500">Mean roundtrip</span>
        </div>
      </div>
      <div class="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center font-bold">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    </Card>

    <Card class="p-4 flex items-center justify-between shadow-2xs hover:border-[var(--ca-brand)] transition-colors">
      <div class="space-y-1">
        <p class="text-xs text-[var(--ca-text-muted)] font-medium">Collections & Endpoints</p>
        <p class="text-2xl font-bold font-mono tracking-tight text-[var(--ca-text-primary)]">
          {collections.length} <span class="text-xs font-normal text-[var(--ca-text-muted)]">/ {totalEndpoints} endpoints</span>
        </p>
        <div class="flex items-center gap-1.5 pt-0.5">
          <span class="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
          <span class="text-[11px] font-medium text-purple-500">{environments.length} environments</span>
        </div>
      </div>
      <div class="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center font-bold">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      </div>
    </Card>
  </div>

  <!-- Telemetry Row: Methods, Status Codes, Active Environment & Vault -->
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
    <!-- HTTP Methods Breakdown -->
    <Card class="p-5 space-y-4">
      <div class="flex items-center justify-between">
        <h4 class="font-bold text-xs uppercase tracking-wider text-[var(--ca-text-secondary)]">HTTP Methods Breakdown</h4>
        <Badge variant="outline" class="font-mono text-[10px]">{totalRequests} Calls</Badge>
      </div>
      <div class="space-y-3">
        {#each methodBreakdown as item}
          <div>
            <div class="flex items-center justify-between text-xs mb-1">
              <span class="inline-flex items-center gap-1.5">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border {item.badgeStyle}">
                  {item.method}
                </span>
              </span>
              <span class="font-mono text-[var(--ca-text-muted)] text-[11px]">{item.count} ({item.pct}%)</span>
            </div>
            <div class="w-full bg-[var(--ca-surface-subtle)] rounded-full h-1.5 overflow-hidden">
              <div class="h-full rounded-full {item.barColor} transition-all duration-300" style="width: {item.pct}%"></div>
            </div>
          </div>
        {/each}
      </div>
    </Card>

    <!-- Status Code Breakdown -->
    <Card class="p-5 space-y-4">
      <div class="flex items-center justify-between">
        <h4 class="font-bold text-xs uppercase tracking-wider text-[var(--ca-text-secondary)]">Status Code Distribution</h4>
        <Badge variant="outline" class="font-mono text-[10px]">{totalRequests > 0 ? 'Live Telemetry' : 'No Data'}</Badge>
      </div>
      <div class="space-y-3.5">
        {#each statusBreakdown as stat}
          <div class="p-2.5 rounded-lg border border-[var(--ca-border)] bg-[var(--ca-surface-subtle)] space-y-2">
            <div class="flex items-center justify-between text-xs">
              <div class="flex items-center gap-2">
                <Badge variant={stat.badgeVariant} class="font-mono text-[10px] font-bold">{stat.code}</Badge>
                <span class="font-medium text-[var(--ca-text-secondary)]">{stat.category}</span>
              </div>
              <span class="font-mono font-semibold text-[var(--ca-text-primary)]">
                {stat.count} <span class="text-[var(--ca-text-muted)] font-normal">({stat.pct}%)</span>
              </span>
            </div>
            <div class="w-full bg-[var(--ca-border)] rounded-full h-1.5 overflow-hidden">
              <div class="h-full rounded-full {stat.barColor} transition-all duration-300" style="width: {stat.pct}%"></div>
            </div>
          </div>
        {/each}
      </div>
    </Card>

    <!-- Active Environment & Vault Status Card -->
    <Card class="p-5 flex flex-col justify-between space-y-4">
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h4 class="font-bold text-xs uppercase tracking-wider text-[var(--ca-text-secondary)]">Active Environment</h4>
          <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            ACTIVE
          </span>
        </div>

        <div class="p-3 rounded-lg border border-[var(--ca-border)] bg-[var(--ca-surface-subtle)] space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="font-bold text-sm text-[var(--ca-text-primary)]">
              {activeEnv?.name ?? 'No Environment'}
            </span>
            <Button variant="ghost" size="sm" onclick={() => goto('/environments')} class="text-[11px] h-7 px-2">
              Manage &rarr;
            </Button>
          </div>
          <p class="text-xs text-[var(--ca-text-muted)]">
            {activeEnv?.description || 'Active key-value interpolation context.'}
          </p>
          <div class="flex items-center gap-2 pt-1">
            <Badge variant="outline" class="font-mono text-[10px]">
              {activeEnv?.variables?.length ?? 0} Variables
            </Badge>
          </div>
        </div>
      </div>

      <div class="p-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5 dark:bg-indigo-500/10 space-y-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span class="text-xs font-bold text-indigo-600 dark:text-indigo-400">SQLCipher E2EE Vault</span>
          </div>
          <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 font-semibold">Zero-Knowledge</span>
        </div>
        <p class="text-[11px] text-[var(--ca-text-muted)]">
          Encrypted at rest with Argon2id & AES-256-GCM. Secret variables and auth tokens remain local to your hardware.
        </p>
      </div>
    </Card>
  </div>

  <!-- Recent API Activity Table -->
  <Card class="p-5 space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="font-bold text-sm text-[var(--ca-text-primary)]">Recent API Activity</h3>
        <p class="text-xs text-[var(--ca-text-muted)]">Live HTTP session telemetry recorded in Workbench.</p>
      </div>
      {#if history.length > 0}
        <Badge variant="outline" class="font-mono text-xs">{history.length} Requests</Badge>
      {/if}
    </div>

    {#if history.length === 0}
      <div class="py-8">
        <EmptyState
          icon="activity"
          title="No API Activity Recorded"
          description="Send requests in the Workbench to see live execution telemetry, latency tracking, and payload metrics."
        />
        <div class="flex justify-center mt-4">
          <Button variant="primary" size="sm" onclick={() => goto('/requests')}>
            Open Workbench
          </Button>
        </div>
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs border-collapse">
          <thead>
            <tr class="border-b border-[var(--ca-border)] text-[var(--ca-text-muted)] uppercase tracking-wider text-[10px]">
              <th scope="col" class="py-2.5 px-3 font-semibold">Timestamp</th>
              <th scope="col" class="py-2.5 px-3 font-semibold">Method</th>
              <th scope="col" class="py-2.5 px-3 font-semibold">Endpoint URL</th>
              <th scope="col" class="py-2.5 px-3 font-semibold">Status</th>
              <th scope="col" class="py-2.5 px-3 font-semibold">Latency</th>
              <th scope="col" class="py-2.5 px-3 font-semibold">Size</th>
              <th scope="col" class="py-2.5 px-3 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--ca-border)]">
            {#each history.slice(0, 10) as row (row.id)}
              <tr class="hover:bg-[var(--ca-surface-subtle)] transition-colors">
                <td class="py-3 px-3 font-mono text-[var(--ca-text-muted)] whitespace-nowrap">
                  {formatTime(row.timestamp)}
                </td>
                <td class="py-3 px-3 whitespace-nowrap">
                  <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold border {getMethodBadgeClass(row.method)}">
                    {row.method}
                  </span>
                </td>
                <td class="py-3 px-3 font-mono text-[var(--ca-text-primary)] max-w-xs truncate" title={row.url}>
                  {row.url}
                </td>
                <td class="py-3 px-3 whitespace-nowrap">
                  <Badge variant={getStatusBadgeVariant(row.status)} class="font-mono text-[10px]">
                    {row.status} {row.statusText || ''}
                  </Badge>
                </td>
                <td class="py-3 px-3 font-mono text-[var(--ca-text-muted)] whitespace-nowrap">
                  {row.elapsedMs}ms
                </td>
                <td class="py-3 px-3 font-mono text-[var(--ca-text-muted)] whitespace-nowrap">
                  {formatBytes(row.sizeBytes)}
                </td>
                <td class="py-3 px-3 text-right whitespace-nowrap">
                  <Button
                    variant="outline"
                    size="sm"
                    class="text-xs h-7 px-2.5"
                    onclick={() => openInWorkbench(row)}
                    aria-label={`Open request to ${row.url} in workbench`}
                  >
                    Open in Workbench
                  </Button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </Card>
</PageContainer>
