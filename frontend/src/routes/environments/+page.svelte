<script lang="ts">
  import { getWorkbench, type EnvironmentItem, type EnvironmentVariable } from '$lib/stores/workbench.svelte';
  import { showToast } from '$lib/stores/uiNotifications.svelte';

  const wb = getWorkbench();
  let environments = $state(wb.environments);
  let activeEnvId = $state(wb.activeEnvironmentId);
  let selectedEnvId = $state(wb.activeEnvironmentId || wb.environments[0]?.id || null);

  let isNewModalOpen = $state(false);
  let newEnvName = $state('');
  let newEnvDesc = $state('');

  const selectedEnv = $derived(
    environments.find((e) => e.id === selectedEnvId) || environments[0] || null
  );

  function setActive(id: string | null) {
    activeEnvId = id;
    wb.setActiveEnvironment(id);
    showToast(id ? 'Active environment updated' : 'Environment cleared', 'info');
  }

  function openNewModal() {
    newEnvName = '';
    newEnvDesc = '';
    isNewModalOpen = true;
  }

  function createEnvironment() {
    if (!newEnvName.trim()) {
      showToast('Environment name is required', 'error');
      return;
    }
    const newEnv: EnvironmentItem = {
      id: crypto.randomUUID(),
      name: newEnvName.trim(),
      description: newEnvDesc.trim() || undefined,
      variables: [
        { id: crypto.randomUUID(), enabled: true, key: 'base_url', value: 'https://api.example.com' },
        { id: crypto.randomUUID(), enabled: true, key: 'token', value: 'secret_token_123' }
      ]
    };
    wb.saveEnvironment(newEnv);
    environments = wb.environments;
    selectedEnvId = newEnv.id;
    if (!activeEnvId) setActive(newEnv.id);
    isNewModalOpen = false;
    showToast(`Environment "${newEnv.name}" created`, 'success');
  }

  function deleteCurrentEnvironment() {
    if (!selectedEnv) return;
    const toDeleteId = selectedEnv.id;
    wb.deleteEnvironment(toDeleteId);
    environments = wb.environments;
    selectedEnvId = environments[0]?.id || null;
    activeEnvId = wb.activeEnvironmentId;
    showToast('Environment deleted', 'info');
  }

  function addVariable() {
    if (!selectedEnv) return;
    selectedEnv.variables.push({
      id: crypto.randomUUID(),
      enabled: true,
      key: '',
      value: ''
    });
    wb.saveEnvironment(selectedEnv);
    environments = wb.environments;
  }

  function removeVariable(varId: string) {
    if (!selectedEnv) return;
    selectedEnv.variables = selectedEnv.variables.filter((v) => v.id !== varId);
    wb.saveEnvironment(selectedEnv);
    environments = wb.environments;
  }

  function updateVariable() {
    if (!selectedEnv) return;
    wb.saveEnvironment(selectedEnv);
    environments = wb.environments;
  }
</script>

<div class="flex flex-col h-full max-w-5xl mx-auto p-6 space-y-5">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-lg font-bold text-neutral-900 dark:text-white">Environments</h1>
      <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
        Manage variable sets and interpolate secrets in request URLs (e.g. <code class="font-mono bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded text-[11px]">&#123;&#123;base_url&#125;&#125;</code>)
      </p>
    </div>
    <div class="flex items-center gap-2">
      <button
        onclick={openNewModal}
        class="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 rounded-lg text-xs font-semibold text-white shadow-sm flex items-center gap-1.5 transition-colors"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
        </svg>
        <span>New Environment</span>
      </button>
    </div>
  </div>

  <!-- Main Content: Left side env list, Right side variables editor -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-5 flex-1 min-h-[450px]">
    <!-- Environments Sidebar -->
    <div class="bg-white dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 rounded-xl p-3 space-y-2 flex flex-col">
      <div class="flex items-center justify-between px-1 pb-1 border-b border-neutral-100 dark:border-neutral-800">
        <span class="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Environment Sets</span>
        <button
          onclick={() => setActive(null)}
          class="text-[10px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
          title="Deactivate all environments"
        >
          Clear Active
        </button>
      </div>

      <div class="flex-1 overflow-y-auto space-y-1.5">
        {#each environments as env (env.id)}
          <div
            role="button"
            tabindex="0"
            onclick={() => (selectedEnvId = env.id)}
            onkeydown={(e) => e.key === 'Enter' && (selectedEnvId = env.id)}
            class="w-full flex items-center justify-between p-2.5 rounded-lg border transition-all text-left cursor-pointer {selectedEnvId === env.id
              ? 'bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 shadow-2xs'
              : 'border-transparent hover:bg-neutral-50 dark:hover:bg-neutral-800/40 text-neutral-600 dark:text-neutral-400'}"
          >
            <div class="min-w-0 pr-2">
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-semibold text-neutral-900 dark:text-white truncate">{env.name}</span>
                {#if activeEnvId === env.id}
                  <span class="px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[9px] font-bold">
                    ACTIVE
                  </span>
                {/if}
              </div>
              <p class="text-[10px] text-neutral-400 dark:text-neutral-500 truncate mt-0.5">
                {env.variables.length} vars · {env.description || 'Custom preset'}
              </p>
            </div>

            <button
              type="button"
              onclick={(e) => {
                e.stopPropagation();
                setActive(activeEnvId === env.id ? null : env.id);
              }}
              class="px-2 py-1 rounded text-[10px] font-semibold transition-colors {activeEnvId === env.id
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'}"
            >
              {activeEnvId === env.id ? 'Active' : 'Use'}
            </button>
          </div>
        {/each}
      </div>
    </div>

    <!-- Variables Editor Pane -->
    <div class="md:col-span-2 bg-white dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 flex flex-col">
      {#if selectedEnv}
        <!-- Top bar of active environment -->
        <div class="flex items-center justify-between pb-3 mb-3 border-b border-neutral-100 dark:border-neutral-800">
          <div>
            <h2 class="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-2">
              <span>{selectedEnv.name}</span>
              {#if activeEnvId === selectedEnv.id}
                <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Currently Active in Workbench"></span>
              {/if}
            </h2>
            <p class="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
              Variables defined here can be referenced in URL, Headers, and Body using <code class="font-mono text-neutral-700 dark:text-neutral-300">&#123;&#123;key&#125;&#125;</code>
            </p>
          </div>

          <div class="flex items-center gap-2">
            <button
              onclick={addVariable}
              class="px-2.5 py-1 text-xs font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg border border-neutral-200 dark:border-neutral-700 flex items-center gap-1 transition-colors"
            >
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
              </svg>
              <span>Add Variable</span>
            </button>
            <button
              onclick={deleteCurrentEnvironment}
              class="px-2.5 py-1 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
              title="Delete this environment"
            >
              Delete
            </button>
          </div>
        </div>

        <!-- Variables Table -->
        <div class="flex-1 overflow-y-auto space-y-2">
          {#if selectedEnv.variables.length === 0}
            <p class="text-xs text-neutral-400 dark:text-neutral-500 italic py-6 text-center">
              No variables in this environment. Click "Add Variable" above.
            </p>
          {:else}
            <div class="space-y-1.5">
              {#each selectedEnv.variables as v (v.id)}
                <div class="flex items-center gap-2">
                  <!-- Enabled toggle -->
                  <input
                    type="checkbox"
                    bind:checked={v.enabled}
                    onchange={updateVariable}
                    class="w-3.5 h-3.5 rounded border-neutral-300 dark:border-neutral-600 accent-neutral-900 dark:accent-white"
                  />

                  <!-- Variable Key -->
                  <input
                    type="text"
                    bind:value={v.key}
                    oninput={updateVariable}
                    placeholder="VARIABLE_NAME"
                    class="w-2/5 px-2.5 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                  />

                  <!-- Variable Value -->
                  <input
                    type="text"
                    bind:value={v.value}
                    oninput={updateVariable}
                    placeholder="value"
                    class="flex-1 px-2.5 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                  />

                  <!-- Delete -->
                  <button
                    onclick={() => removeVariable(v.id)}
                    class="p-1 text-neutral-300 dark:text-neutral-600 hover:text-rose-500 transition-colors"
                    title="Remove variable"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        <div class="flex-1 flex items-center justify-center text-xs text-neutral-400">
          No environment selected
        </div>
      {/if}
    </div>
  </div>

  <!-- New Environment Modal -->
  {#if isNewModalOpen}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div class="w-full max-w-sm bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-2xl space-y-3.5 text-xs text-neutral-800 dark:text-neutral-200">
        <div class="flex items-center justify-between pb-2 border-b border-neutral-200 dark:border-neutral-800">
          <h3 class="text-sm font-bold text-neutral-900 dark:text-white">New Environment</h3>
          <button onclick={() => (isNewModalOpen = false)} class="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-white">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="space-y-2.5">
          <div>
            <label for="env-name" class="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 mb-1">Environment Name *</label>
            <input
              id="env-name"
              type="text"
              bind:value={newEnvName}
              placeholder="e.g. Staging, Production, Local Docker"
              class="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label for="env-desc" class="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 mb-1">Description (Optional)</label>
            <input
              id="env-desc"
              type="text"
              bind:value={newEnvDesc}
              placeholder="Short note"
              class="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <button onclick={() => (isNewModalOpen = false)} class="px-3 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-800 dark:hover:text-white rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onclick={createEnvironment}
            class="px-3.5 py-1.5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 rounded-lg shadow-sm transition-colors"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
