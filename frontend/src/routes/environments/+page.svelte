<script lang="ts">
  import { getWorkbench, type EnvironmentItem } from '$lib/stores/workbench.svelte';
  import { showToast } from '$lib/stores/uiNotifications.svelte';
  import PageHead from '$lib/components/page/PageHead.svelte';
  import { exportEnvironmentFile, importFromFiles } from '$lib/ui/transfer';

  const wb = getWorkbench();
  const environments = $derived(wb.environments);
  const activeEnvId = $derived(wb.activeEnvironmentId);

  /** 'globals' selects the workspace-wide globals; anything else is an environment id. */
  let selectedId = $state<string>(wb.activeEnvironmentId || wb.environments[0]?.id || 'globals');
  let modalOpen = $state(false);
  let newName = $state('');
  let reveal = $state(false);

  const isGlobals = $derived(selectedId === 'globals');
  const selectedEnv = $derived(isGlobals ? null : (environments.find((e) => e.id === selectedId) ?? null));
  const rows = $derived(isGlobals ? wb.globals : (selectedEnv?.variables ?? []));
  const looksSecret = (k: string) => /token|secret|password|pass|key|auth|cred/i.test(k);

  function persist() {
    if (isGlobals) wb.saveGlobals();
    else if (selectedEnv) wb.saveEnvironment(selectedEnv);
  }
  function setActive(id: string | null) {
    wb.setActiveEnvironment(id);
    showToast(id ? 'Active environment updated' : 'No environment active', 'info');
  }
  function create() {
    if (!newName.trim()) return showToast('Environment name is required', 'error');
    const env: EnvironmentItem = { id: crypto.randomUUID(), name: newName.trim(), variables: [{ id: crypto.randomUUID(), enabled: true, key: 'base_url', value: '' }] };
    wb.saveEnvironment(env);
    selectedId = env.id;
    if (!wb.activeEnvironmentId) wb.setActiveEnvironment(env.id);
    modalOpen = false;
    showToast(`Environment "${env.name}" created`, 'success');
  }
  function remove() {
    if (!selectedEnv || !confirm(`Delete environment "${selectedEnv.name}"?`)) return;
    wb.deleteEnvironment(selectedEnv.id);
    selectedId = wb.environments[0]?.id ?? 'globals';
    showToast('Environment deleted', 'info');
  }
  function addVariable() {
    rows.push({ id: crypto.randomUUID(), enabled: true, key: '', value: '' });
    persist();
  }
  function removeVariable(id: string) {
    const i = rows.findIndex((v) => v.id === id);
    if (i >= 0) rows.splice(i, 1);
    persist();
  }
  async function doImport() {
    const before = new Set(wb.environments.map((e) => e.id));
    await importFromFiles('.json');
    const added = wb.environments.find((e) => !before.has(e.id));
    if (added) selectedId = added.id;
  }
</script>

<div class="cp-page h-full">
  <PageHead title="Environments">
    {#snippet meta()}
      Variable sets referenced as <code class="font-mono text-[11.5px] px-1 py-0.5 rounded bg-neutral-100 dark:bg-white/[0.06]">&#123;&#123;name&#125;&#125;</code> in URLs, headers, bodies and scripts.
    {/snippet}
    {#snippet actions()}
      <button class="cp-btn" onclick={doImport} title="Import Postman environment / globals (.json)">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></svg>
        Import
      </button>
      <button
        class="cp-btn cp-btn-primary"
        onclick={() => {
          newName = '';
          modalOpen = true;
        }}
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14" /></svg>
        New environment
      </button>
    {/snippet}
  </PageHead>

  <div class="grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] gap-5 flex-1 min-h-[420px]">
    <!-- list -->
    <div class="cp-card flex flex-col min-h-0 overflow-hidden">
      <div class="flex-1 min-h-0 overflow-y-auto wb-scroll p-1.5 space-y-0.5">
        <button
          class="w-full text-left px-2.5 py-2 rounded-lg transition-colors {isGlobals ? 'bg-brand-500/10' : 'hover:bg-neutral-100 dark:hover:bg-white/[0.04]'}"
          onclick={() => (selectedId = 'globals')}
        >
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 shrink-0 {isGlobals ? 'text-brand-500' : 'text-neutral-400'}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" /></svg>
            <span class="flex-1 truncate text-[12.5px] font-medium">Globals</span>
            <span class="text-[11px] font-mono text-neutral-400">{wb.globals.length}</span>
          </div>
        </button>
        <div class="px-2.5 pt-3 pb-1 cp-eyebrow">Environments</div>
        {#each environments as env (env.id)}
          <div
            role="button"
            tabindex="0"
            class="group flex items-center gap-2 h-9 px-2.5 rounded-lg cursor-pointer transition-colors {selectedId === env.id ? 'bg-brand-500/10' : 'hover:bg-neutral-100 dark:hover:bg-white/[0.04]'}"
            onclick={() => (selectedId = env.id)}
            onkeydown={(e) => e.key === 'Enter' && (selectedId = env.id)}
          >
            <span class="w-2 h-2 rounded-full shrink-0 {activeEnvId === env.id ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-600'}" title={activeEnvId === env.id ? 'Active' : 'Inactive'}></span>
            <span class="flex-1 truncate text-[12.5px] font-medium">{env.name}</span>
            <span class="text-[11px] font-mono text-neutral-400 group-hover:hidden">{env.variables.length}</span>
            <button
              class="hidden group-hover:inline-flex cp-btn cp-btn-sm !h-6 !px-2 {activeEnvId === env.id ? '!text-emerald-600 dark:!text-emerald-400' : ''}"
              onclick={(e) => {
                e.stopPropagation();
                setActive(activeEnvId === env.id ? null : env.id);
              }}>{activeEnvId === env.id ? 'Active' : 'Use'}</button
            >
          </div>
        {:else}
          <p class="px-3 py-4 cp-muted">No environments yet.</p>
        {/each}
      </div>
    </div>

    <!-- editor -->
    <div class="cp-card flex flex-col min-h-0 overflow-hidden">
      <div class="flex items-center justify-between gap-3 px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
        <div class="min-w-0">
          <h2 class="flex items-center gap-2 text-[14px] font-semibold text-neutral-900 dark:text-white truncate">
            {isGlobals ? 'Globals' : (selectedEnv?.name ?? 'No environment')}
            {#if selectedEnv && activeEnvId === selectedEnv.id}
              <span class="cp-pill bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 font-sans">Active</span>
            {/if}
          </h2>
          <p class="cp-muted mt-0.5">{isGlobals ? 'Available to every request; collection and environment values override them.' : 'Overrides globals and collection variables while active.'}</p>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          {#if selectedEnv}
            <button class="cp-btn cp-btn-sm" onclick={() => setActive(activeEnvId === selectedEnv.id ? null : selectedEnv.id)}>
              {activeEnvId === selectedEnv.id ? 'Deactivate' : 'Set active'}
            </button>
          {/if}
          <button class="cp-btn cp-btn-sm" onclick={() => exportEnvironmentFile(isGlobals ? 'globals' : (selectedEnv?.id ?? ''))} disabled={!isGlobals && !selectedEnv} title="Save as Postman environment (.json)">Export</button>
          <button class="cp-icon-btn" title={reveal ? 'Hide secret values' : 'Show secret values'} aria-label="Toggle secret values" onclick={() => (reveal = !reveal)}>
            {#if reveal}
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A10 10 0 0121 12a10.4 10.4 0 01-2.2 3.2M6.6 6.6A10.4 10.4 0 003 12a10 10 0 0013.4 5.4" /></svg>
            {:else}
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
            {/if}
          </button>
          {#if selectedEnv}
            <button class="cp-icon-btn hover:!text-rose-500" title="Delete environment" aria-label="Delete environment" onclick={remove}>
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" /></svg>
            </button>
          {/if}
        </div>
      </div>

      {#if isGlobals || selectedEnv}
        <div class="flex-1 min-h-0 overflow-y-auto wb-scroll">
          <table class="cp-table">
            <thead>
              <tr>
                <th class="w-10 !px-0 text-center"><span class="sr-only">Enabled</span></th>
                <th class="w-[38%]">Variable</th>
                <th>Value</th>
                <th class="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {#each rows as v (v.id)}
                <tr class="group">
                  <td class="!px-0 text-center">
                    <input type="checkbox" class="accent-brand-600 w-3.5 h-3.5" bind:checked={v.enabled} onchange={persist} aria-label="Enabled" />
                  </td>
                  <td class="!py-1">
                    <input class="cp-input !h-7 font-mono !border-transparent hover:!border-neutral-200 dark:hover:!border-neutral-700 focus:!border-brand-500/70 !bg-transparent" bind:value={v.key} oninput={persist} placeholder="variable_name" />
                  </td>
                  <td class="!py-1">
                    <input
                      class="cp-input !h-7 font-mono !border-transparent hover:!border-neutral-200 dark:hover:!border-neutral-700 focus:!border-brand-500/70 !bg-transparent"
                      type={!reveal && looksSecret(v.key) ? 'password' : 'text'}
                      bind:value={v.value}
                      oninput={persist}
                      placeholder="value"
                    />
                  </td>
                  <td class="!px-1 text-center">
                    <button class="cp-icon-btn opacity-0 group-hover:opacity-100 hover:!text-rose-500" aria-label="Remove variable" onclick={() => removeVariable(v.id)}>
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
          <div class="p-3">
            <button class="cp-btn cp-btn-sm cp-btn-ghost !text-brand-600 dark:!text-brand-400" onclick={addVariable}>+ Add variable</button>
          </div>
        </div>
      {:else}
        <div class="cp-empty flex-1">
          <p class="cp-muted">Create an environment to group variables such as <code class="font-mono">base_url</code> per stage.</p>
        </div>
      {/if}
    </div>
  </div>
</div>

{#if modalOpen}
  <div class="wb-overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && (modalOpen = false)}>
    <div class="wb-modal w-full max-w-sm" role="dialog" aria-modal="true" aria-labelledby="new-env-title">
      <div class="cp-card-head">
        <h3 id="new-env-title" class="cp-card-title">New environment</h3>
        <button class="cp-icon-btn" aria-label="Close" onclick={() => (modalOpen = false)}>
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <form
        class="cp-card-body space-y-3"
        onsubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <div>
          <label class="cp-label" for="env-name">Name</label>
          <!-- svelte-ignore a11y_autofocus -->
          <input id="env-name" class="cp-input" autofocus bind:value={newName} placeholder="e.g. Staging" />
        </div>
        <div class="flex justify-end gap-2 pt-1">
          <button type="button" class="cp-btn cp-btn-ghost" onclick={() => (modalOpen = false)}>Cancel</button>
          <button type="submit" class="cp-btn cp-btn-primary">Create</button>
        </div>
      </form>
    </div>
  </div>
{/if}
