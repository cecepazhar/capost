<script lang="ts">
  import { getWorkbench, type HttpMethod, type ParamRow, type HeaderRow, type AuthType, type BodyType } from '$lib/stores/workbench.svelte';
  import { copyText } from '$lib/utils/clipboard';
  import { showToast } from '$lib/stores/uiNotifications.svelte';
  import { onMount } from 'svelte';
  import { isPro } from '$lib/stores/billing.svelte';
  import { proGate } from '$lib/stores/proGate.svelte';

  let {
    onNavigateToCollection = () => {},
    onNavigateToEnvironments = () => {},
    onNavigateToHistory = () => {}
  } = $props();

  const wb = getWorkbench();
  let request = $state(wb.currentRequest);
  let response = $state(wb.currentResponse);

  const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
  const METHOD_COLORS: Record<HttpMethod, string> = {
    GET: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    POST: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
    PUT: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
    DELETE: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
    PATCH: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
    HEAD: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
    OPTIONS: 'bg-neutral-500/15 text-neutral-600 dark:text-neutral-400 border-neutral-500/30'
  };

  let activeRequestTab = $state<'params' | 'headers' | 'auth' | 'body' | 'assertions'>('params');
  let activeResponseTab = $state<'body' | 'headers'>('body');

  export interface AssertionRule {
    id: string;
    type: 'status' | 'header' | 'response_time' | 'body_json';
    operator: string;
    target: string;
    active: boolean;
  }

  let assertions = $state<AssertionRule[]>([
    { id: '1', type: 'status', operator: 'equals', target: '200', active: true }
  ]);

  let aiDiagnosisModalOpen = $state(false);

  function handleGenerateAssertions() {
    if (!$isPro) {
      proGate.open(
        'Generate Assertions with AI',
        'Fitur AI memerlukan lisensi CAPost PRO. Pro member dapat menggunakan API Key sendiri (BYOK - OpenAI, Claude, Gemini, DeepSeek, Ollama) tanpa batas.'
      );
      return;
    }
    activeRequestTab = 'assertions';
    assertions = [
      { id: crypto.randomUUID(), type: 'status', operator: 'equals', target: response ? String(response.status) : '200', active: true },
      { id: crypto.randomUUID(), type: 'header', operator: 'contains', target: 'application/json', active: true },
      { id: crypto.randomUUID(), type: 'response_time', operator: 'less_than', target: '1000', active: true },
      { id: crypto.randomUUID(), type: 'body_json', operator: 'is_not_empty', target: '$', active: true }
    ];
    showToast('AI berhasil menghasilkan 4 assertion untuk request ini', 'success');
  }

  function handleAiErrorDiagnosis() {
    if (!$isPro) {
      proGate.open(
        'AI Error Diagnosis',
        'Fitur AI memerlukan lisensi CAPost PRO. Pro member dapat menggunakan API Key sendiri (BYOK - OpenAI, Claude, Gemini, DeepSeek, Ollama) tanpa batas.'
      );
      return;
    }
    if (!response) {
      showToast('Belum ada respons HTTP untuk didiagnosa', 'info');
      return;
    }
    aiDiagnosisModalOpen = true;
  }

  function updateRequest() {
    request = { ...request };
    wb.currentRequest = request;
  }

  function setMethod(m: HttpMethod) {
    request.method = m;
    updateRequest();
  }

  function addParam() {
    request.params.push({ id: crypto.randomUUID(), enabled: true, key: '', value: '' });
    updateRequest();
  }

  function removeParam(id: string) {
    request.params = request.params.filter((p) => p.id !== id);
    updateRequest();
  }

  function addHeader() {
    request.headers.push({ id: crypto.randomUUID(), enabled: true, key: '', value: '' });
    updateRequest();
  }

  function removeHeader(id: string) {
    request.headers = request.headers.filter((h) => h.id !== id);
    updateRequest();
  }

  function setAuthType(t: AuthType) {
    request.auth.type = t;
    updateRequest();
  }

  function setBodyType(t: BodyType) {
    request.body.type = t;
    updateRequest();
  }

  function formatJson() {
    try {
      const parsed = JSON.parse(request.body.rawJson);
      request.body.rawJson = JSON.stringify(parsed, null, 2);
      updateRequest();
      showToast('JSON formatted successfully', 'success');
    } catch (e: any) {
      showToast(`Invalid JSON: ${e?.message || 'parse error'}`, 'error');
    }
  }

  async function sendRequest() {
    if (request.url.trim() === '') {
      showToast('URL is empty', 'error');
      return;
    }
    await wb.sendRequest();
    if (wb.currentResponse) {
      response = wb.currentResponse;
      activeResponseTab = 'body';
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      sendRequest();
    }
  }

  function getStatusVariant(status: number): string {
    if (status >= 500) return 'text-rose-600 dark:text-rose-400';
    if (status >= 400) return 'text-amber-600 dark:text-amber-400';
    if (status >= 300) return 'text-blue-600 dark:text-blue-400';
    return 'text-emerald-600 dark:text-emerald-400';
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function prettyResponseBody(): string {
    if (!response?.body) return '';
    try {
      return JSON.stringify(JSON.parse(response.body), null, 2);
    } catch {
      return response.body;
    }
  }

  onMount(() => {
    // Component mounted
  });
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="flex flex-col h-[calc(100vh-8rem)] min-h-[500px]">
  <!-- Top URL Bar -->
  <div class="flex flex-col gap-2 mb-4">
    <div class="flex items-center gap-2">
      <!-- Method selector -->
      <div class="flex items-center gap-0.5 bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 rounded-lg p-1">
        {#each METHODS as m (m)}
          <button
            onclick={() => setMethod(m)}
            class="px-2 py-1 text-xs font-mono font-bold rounded transition-all {request.method === m
              ? METHOD_COLORS[m]
              : 'text-neutral-400 dark:text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-700 dark:hover:text-neutral-300'}"
          >
            {m}
          </button>
        {/each}
      </div>

      <!-- URL input -->
      <input
        type="text"
        value={request.url}
        oninput={(e) => {
          request.url = (e.target as HTMLInputElement).value;
          updateRequest();
        }}
        onkeydown={(e) => {
          if (e.key === 'Enter') sendRequest();
        }}
        placeholder={'Enter URL… e.g. https://httpbin.org/get?client={{user_agent}}'}
        class="flex-1 px-3 py-2 bg-neutral-50 dark:bg-neutral-900/70 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
      />

      <!-- Send button -->
      <button
        onclick={sendRequest}
        disabled={wb.isSending}
        class="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 rounded-lg text-xs font-semibold text-white shadow-sm flex items-center gap-1.5 transition-colors"
      >
        {#if wb.isSending}
          <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
          <span>Sending…</span>
        {:else}
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 5l7 7-7 7M5 12h12" />
          </svg>
          <span>Send</span>
        {/if}
      </button>
    </div>

    <div class="flex items-center justify-between text-[11px] text-neutral-400 dark:text-neutral-500">
      <span>Environment: <span class="font-medium text-neutral-600 dark:text-neutral-300">{wb.activeEnvironment ? wb.activeEnvironment.name : 'None'}</span>
        <button onclick={onNavigateToEnvironments} class="ml-1 text-indigo-600 dark:text-indigo-400 hover:underline">Switch</button>
      </span>
      <div class="flex items-center gap-3">
        <button onclick={() => onNavigateToCollection(request.id)} class="hover:text-neutral-600 dark:hover:text-neutral-300 flex items-center gap-1">
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <span>Save to Collection</span>
        </button>
        <button onclick={onNavigateToHistory} class="hover:text-neutral-600 dark:hover:text-neutral-300 flex items-center gap-1">
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>History</span>
        </button>
      </div>
    </div>
  </div>

  <!-- Two-Pane Layout -->
  <div class="flex-1 min-h-0 grid grid-cols-2 gap-4">
    <!-- Left Pane: Request -->
    <div class="flex flex-col min-h-0 bg-white dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
      <!-- Request Tabs -->
      <div class="flex items-center border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-2">
        {#each ['params', 'headers', 'auth', 'body'] as tab (tab)}
          <button
            onclick={() => (activeRequestTab = tab as any)}
            class="px-3 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px {activeRequestTab === tab
              ? 'text-neutral-900 dark:text-white border-neutral-900 dark:border-white'
              : 'text-neutral-400 dark:text-neutral-500 border-transparent hover:text-neutral-600 dark:hover:text-neutral-300'}"
          >
            {tab === 'params' ? 'Params' : tab === 'headers' ? 'Headers' : tab === 'auth' ? 'Auth' : 'Body'}
            {#if tab === 'params' && request.params.filter((p) => p.enabled).length}
              <span class="ml-1.5 px-1.5 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-700 text-[10px]">{request.params.filter((p) => p.enabled).length}</span>
            {/if}
            {#if tab === 'headers' && request.headers.filter((h) => h.enabled).length}
              <span class="ml-1.5 px-1.5 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-700 text-[10px]">{request.headers.filter((h) => h.enabled).length}</span>
            {/if}
          </button>
        {/each}
        
        <!-- Pro-Gated Assertions Tab -->
        <button
          onclick={() => {
            if (!$isPro) {
              proGate.open(
                'Tab Assertion',
                'Fitur AI & Automated Testing memerlukan lisensi CAPost PRO. Pro member dapat menggunakan API Key sendiri (BYOK - OpenAI, Claude, Gemini, DeepSeek, Ollama) tanpa batas.'
              );
            } else {
              activeRequestTab = 'assertions';
            }
          }}
          class="px-3 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ml-auto flex items-center gap-1.5 {activeRequestTab === 'assertions'
            ? 'text-neutral-900 dark:text-white border-neutral-900 dark:border-white'
            : 'text-indigo-600 dark:text-indigo-400 border-transparent hover:text-indigo-800 dark:hover:text-indigo-300'}"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Assertions</span>
          {#if !$isPro}
            <span class="text-[9px] px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded border border-amber-500/20">PRO</span>
          {/if}
        </button>
      </div>

      <!-- Request Tab Content -->
      <div class="flex-1 overflow-y-auto p-3 space-y-2">
        {#if activeRequestTab === 'params'}
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Query Parameters</h3>
            <button onclick={addParam} class="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5">
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
              </svg>
              <span>Add</span>
            </button>
          </div>

          {#if request.params.length === 0}
            <p class="text-xs text-neutral-400 dark:text-neutral-500 italic py-4 text-center">No query parameters yet. Click "Add" to create one.</p>
          {:else}
            <div class="space-y-1.5">
              {#each request.params as p (p.id)}
                <div class="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={p.enabled}
                    onchange={(e) => {
                      p.enabled = (e.target as HTMLInputElement).checked;
                      updateRequest();
                    }}
                    class="w-3.5 h-3.5 rounded border-neutral-300 dark:border-neutral-600 accent-neutral-900 dark:accent-white"
                  />
                  <input
                    type="text"
                    value={p.key}
                    oninput={(e) => {
                      p.key = (e.target as HTMLInputElement).value;
                      updateRequest();
                    }}
                    placeholder="key"
                    class="w-1/3 px-2 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-xs font-mono placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                  />
                  <span class="text-neutral-400 text-xs">=</span>
                  <input
                    type="text"
                    value={p.value}
                    oninput={(e) => {
                      p.value = (e.target as HTMLInputElement).value;
                      updateRequest();
                    }}
                    placeholder="value"
                    class="flex-1 px-2 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-xs font-mono placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                  />
                  <button
                    onclick={() => removeParam(p.id)}
                    class="p-0.5 text-neutral-300 dark:text-neutral-600 hover:text-rose-500 transition-colors"
                    title="Remove"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              {/each}
            </div>
          {/if}

        {:else if activeRequestTab === 'headers'}
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Request Headers</h3>
            <button onclick={addHeader} class="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5">
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
              </svg>
              <span>Add</span>
            </button>
          </div>

          {#if request.headers.length === 0}
            <p class="text-xs text-neutral-400 dark:text-neutral-500 italic py-4 text-center">No custom headers. Add Content-Type, Authorization, etc.</p>
          {:else}
            <div class="space-y-1.5">
              {#each request.headers as h (h.id)}
                <div class="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={h.enabled}
                    onchange={(e) => {
                      h.enabled = (e.target as HTMLInputElement).checked;
                      updateRequest();
                    }}
                    class="w-3.5 h-3.5 rounded border-neutral-300 dark:border-neutral-600 accent-neutral-900 dark:accent-white"
                  />
                  <input
                    type="text"
                    value={h.key}
                    oninput={(e) => {
                      h.key = (e.target as HTMLInputElement).value;
                      updateRequest();
                    }}
                    placeholder="Header-Name"
                    class="w-2/5 px-2 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-xs font-mono placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                  />
                  <input
                    type="text"
                    value={h.value}
                    oninput={(e) => {
                      h.value = (e.target as HTMLInputElement).value;
                      updateRequest();
                    }}
                    placeholder="value"
                    class="flex-1 px-2 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-xs font-mono placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                  />
                  <button
                    onclick={() => removeHeader(h.id)}
                    class="p-0.5 text-neutral-300 dark:text-neutral-600 hover:text-rose-500 transition-colors"
                    title="Remove"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              {/each}
            </div>
          {/if}

        {:else if activeRequestTab === 'auth'}
          <div class="mb-3">
            <h3 class="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-2">Authentication</h3>
            <div class="flex items-center gap-1.5">
              {#each ['none', 'bearer', 'basic', 'apikey'] as t (t)}
                <button
                  onclick={() => setAuthType(t as AuthType)}
                  class="px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors border {request.auth.type === t
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-neutral-900 dark:border-white'
                    : 'bg-neutral-100 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'}"
                >
                  {t === 'none' ? 'None' : t === 'bearer' ? 'Bearer Token' : t === 'basic' ? 'Basic Auth' : 'API Key'}
                </button>
              {/each}
            </div>
          </div>

          {#if request.auth.type === 'bearer'}
            <div>
              <label class="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5 block">Bearer Token</label>
              <input
                type="password"
                value={request.auth.bearerToken}
                oninput={(e) => {
                  request.auth.bearerToken = (e.target as HTMLInputElement).value;
                  updateRequest();
                }}
                placeholder="eyJhbGciOi..."
                class="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-mono placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>
          {:else if request.auth.type === 'basic'}
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5 block">Username</label>
                <input
                  type="text"
                  value={request.auth.basicUser}
                  oninput={(e) => {
                    request.auth.basicUser = (e.target as HTMLInputElement).value;
                    updateRequest();
                  }}
                  placeholder="username"
                  class="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-mono placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>
              <div>
                <label class="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5 block">Password</label>
                <input
                  type="password"
                  value={request.auth.basicPass}
                  oninput={(e) => {
                    request.auth.basicPass = (e.target as HTMLInputElement).value;
                    updateRequest();
                  }}
                  placeholder="password"
                  class="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-mono placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>
            </div>
          {:else if request.auth.type === 'apikey'}
            <div class="space-y-2.5">
              <div>
                <label class="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5 block">Key Name / Header</label>
                <input
                  type="text"
                  value={request.auth.apiKeyName}
                  oninput={(e) => {
                    request.auth.apiKeyName = (e.target as HTMLInputElement).value;
                    updateRequest();
                  }}
                  placeholder="X-API-Key"
                  class="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-mono placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>
              <div>
                <label class="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5 block">Key Value</label>
                <input
                  type="password"
                  value={request.auth.apiKeyValue}
                  oninput={(e) => {
                    request.auth.apiKeyValue = (e.target as HTMLInputElement).value;
                    updateRequest();
                  }}
                  placeholder="sk-xxxx..."
                  class="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-mono placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>
              <div>
                <label class="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5 block">Add to</label>
                <div class="flex items-center gap-2">
                  <label class="flex items-center gap-1.5 text-xs">
                    <input
                      type="radio"
                      name="apikey_addto"
                      checked={request.auth.apiKeyAddTo === 'header'}
                      onchange={() => {
                        request.auth.apiKeyAddTo = 'header';
                        updateRequest();
                      }}
                      class="w-3.5 h-3.5"
                    />
                    <span>Header</span>
                  </label>
                  <label class="flex items-center gap-1.5 text-xs">
                    <input
                      type="radio"
                      name="apikey_addto"
                      checked={request.auth.apiKeyAddTo === 'query'}
                      onchange={() => {
                        request.auth.apiKeyAddTo = 'query';
                        updateRequest();
                      }}
                      class="w-3.5 h-3.5"
                    />
                    <span>Query Param</span>
                  </label>
                </div>
              </div>
            </div>
          {:else}
            <p class="text-xs text-neutral-400 dark:text-neutral-500 italic">No authentication configured. Choose an auth type above.</p>
          {/if}

        {:else if activeRequestTab === 'body'}
          <div class="mb-3">
            <h3 class="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-2">Request Body</h3>
            <div class="flex items-center gap-1.5 flex-wrap">
              {#each ['none', 'json', 'form-data', 'urlencoded'] as t (t)}
                <button
                  onclick={() => setBodyType(t as BodyType)}
                  class="px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors border {request.body.type === t
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-neutral-900 dark:border-white'
                    : 'bg-neutral-100 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'}"
                >
                  {t === 'json' ? 'JSON' : t === 'form-data' ? 'Form Data' : t === 'urlencoded' ? 'x-www-form-urlencoded' : 'None'}
                </button>
              {/each}
            </div>
          </div>

          {#if request.body.type === 'json'}
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center justify-between">
                <span class="text-[11px] text-neutral-400 dark:text-neutral-500">Raw JSON payload (use <code class="font-mono bg-neutral-100 dark:bg-neutral-800 px-1 rounded">&#123;&#123;var_name&#125;&#125;</code> to interpolate)</span>
                <button
                  onclick={formatJson}
                  class="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                >
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7" />
                  </svg>
                  <span>Format</span>
                </button>
              </div>
              <textarea
                rows={10}
                value={request.body.rawJson}
                oninput={(e) => {
                  request.body.rawJson = (e.target as HTMLTextAreaElement).value;
                  updateRequest();
                }}
                class="w-full px-3 py-2.5 bg-neutral-900/90 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-mono text-emerald-300 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-y min-h-[140px]"
                placeholder={`{\n  "key": "value"\n}`}
              ></textarea>
            </div>
          {:else if request.body.type === 'form-data'}
            <div class="space-y-1.5">
              {#each request.body.formData as row (row.id)}
                <div class="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onchange={(e) => {
                      row.enabled = (e.target as HTMLInputElement).checked;
                      updateRequest();
                    }}
                    class="w-3.5 h-3.5 rounded border-neutral-300 dark:border-neutral-600 accent-neutral-900 dark:accent-white"
                  />
                  <input
                    type="text"
                    value={row.key}
                    oninput={(e) => {
                      row.key = (e.target as HTMLInputElement).value;
                      updateRequest();
                    }}
                    placeholder="key"
                    class="w-1/3 px-2 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-xs font-mono placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                  />
                  <input
                    type="text"
                    value={row.value}
                    oninput={(e) => {
                      row.value = (e.target as HTMLInputElement).value;
                      updateRequest();
                    }}
                    placeholder="value"
                    class="flex-1 px-2 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-xs font-mono placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                  />
                  <button
                    onclick={() => {
                      request.body.formData = request.body.formData.filter((r) => r.id !== row.id);
                      updateRequest();
                    }}
                    class="p-0.5 text-neutral-300 dark:text-neutral-600 hover:text-rose-500 transition-colors"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              {/each}
              <button
                onclick={() => {
                  request.body.formData.push({ id: crypto.randomUUID(), enabled: true, key: '', value: '' });
                  updateRequest();
                }}
                class="text-[11px] text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 flex items-center gap-0.5 pt-1"
              >
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
                </svg>
                <span>Add Form Field</span>
              </button>
            </div>
          {:else if request.body.type === 'urlencoded'}
            <div class="space-y-1.5">
              {#each request.body.urlencoded as row (row.id)}
                <div class="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onchange={(e) => {
                      row.enabled = (e.target as HTMLInputElement).checked;
                      updateRequest();
                    }}
                    class="w-3.5 h-3.5 rounded border-neutral-300 dark:border-neutral-600 accent-neutral-900 dark:accent-white"
                  />
                  <input
                    type="text"
                    value={row.key}
                    oninput={(e) => {
                      row.key = (e.target as HTMLInputElement).value;
                      updateRequest();
                    }}
                    placeholder="key"
                    class="w-1/3 px-2 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-xs font-mono placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                  />
                  <input
                    type="text"
                    value={row.value}
                    oninput={(e) => {
                      row.value = (e.target as HTMLInputElement).value;
                      updateRequest();
                    }}
                    placeholder="value"
                    class="flex-1 px-2 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-xs font-mono placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                  />
                  <button
                    onclick={() => {
                      request.body.urlencoded = request.body.urlencoded.filter((r) => r.id !== row.id);
                      updateRequest();
                    }}
                    class="p-0.5 text-neutral-300 dark:text-neutral-600 hover:text-rose-500 transition-colors"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              {/each}
              <button
                onclick={() => {
                  request.body.urlencoded.push({ id: crypto.randomUUID(), enabled: true, key: '', value: '' });
                  updateRequest();
                }}
                class="text-[11px] text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 flex items-center gap-0.5 pt-1"
              >
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
                </svg>
                <span>Add URL-Encoded Field</span>
              </button>
            </div>
          {:else}
            <p class="text-xs text-neutral-400 dark:text-neutral-500 italic py-4 text-center">No request body. For methods that accept bodies, select a body type above.</p>
          {/if}
        {:else if activeRequestTab === 'assertions'}
          <div class="space-y-3">
            <div class="flex items-center justify-between pb-2 border-b border-neutral-200 dark:border-neutral-800">
              <div>
                <h3 class="text-xs font-semibold text-neutral-900 dark:text-white">API Test Assertions</h3>
                <p class="text-[11px] text-neutral-400">Otomatisasi pengujian respons API &amp; validasi skema</p>
              </div>
              <button
                type="button"
                onclick={handleGenerateAssertions}
                class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>✨</span>
                <span>Generate Assertions with AI</span>
              </button>
            </div>

            <div class="space-y-2">
              {#each assertions as a (a.id)}
                <div class="p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    bind:checked={a.active}
                    class="w-3.5 h-3.5 rounded border-neutral-300 dark:border-neutral-600 accent-indigo-600"
                  />
                  <select
                    bind:value={a.type}
                    class="px-2 py-1 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded font-mono text-xs"
                  >
                    <option value="status">Status Code</option>
                    <option value="header">Header</option>
                    <option value="response_time">Latency (ms)</option>
                    <option value="body_json">JSON Body</option>
                  </select>
                  <select
                    bind:value={a.operator}
                    class="px-2 py-1 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded text-xs"
                  >
                    <option value="equals">equals</option>
                    <option value="contains">contains</option>
                    <option value="less_than">less than</option>
                    <option value="is_not_empty">not empty</option>
                  </select>
                  <input
                    type="text"
                    bind:value={a.target}
                    placeholder="target value"
                    class="flex-1 px-2 py-1 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded font-mono text-xs"
                  />
                  <button
                    onclick={() => { assertions = assertions.filter((x) => x.id !== a.id); }}
                    class="text-neutral-400 hover:text-rose-500 p-1"
                    title="Hapus"
                  >
                    ✕
                  </button>
                </div>
              {/each}

              <button
                type="button"
                onclick={() => assertions.push({ id: crypto.randomUUID(), type: 'status', operator: 'equals', target: '200', active: true })}
                class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 pt-1"
              >
                <span>+ Add Manual Assertion</span>
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Right Pane: Response -->
    <div class="flex flex-col min-h-0 bg-white dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
      <!-- Response Header -->
      <div class="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-3 py-2">
        {#if response}
          <div class="flex items-center gap-3">
            <!-- Status badge -->
            <div class="flex items-center gap-1.5">
              <span
                class="px-2.5 py-1 rounded-lg text-xs font-mono font-bold {response.status >= 500
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                  : response.status >= 400
                  ? 'bg-rose-500/10 text-rose-500'
                  : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'}"
              >
                {response.status} {response.statusText}
              </span>
            </div>
            <!-- Metrics pills -->
            <div class="flex items-center gap-1.5 text-[11px]">
              <span class="px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 font-mono">
                {response.elapsedMs} ms
              </span>
              <span class="px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 font-mono">
                {formatSize(response.sizeBytes)}
              </span>
            </div>

            <!-- AI Error Diagnosis Button -->
            <button
              type="button"
              onclick={handleAiErrorDiagnosis}
              class="px-2 py-0.5 rounded-md text-[11px] font-semibold {response.status >= 400
                ? 'bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/25'
                : 'bg-indigo-500/10 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20'} transition-all flex items-center gap-1 cursor-pointer"
              title="Diagnosa Error dengan AI"
            >
              <span>✨</span>
              <span>{response.status >= 400 ? 'AI Diagnose Error' : 'AI Inspect'}</span>
              {#if !$isPro}
                <span class="text-[9px] px-1 py-0.2 bg-amber-500/20 text-amber-500 rounded border border-amber-500/30 font-bold">PRO</span>
              {/if}
            </button>
          </div>
        {:else}
          <span class="text-xs text-neutral-400 dark:text-neutral-500 italic">Response will appear here</span>
        {/if}

        <div class="flex items-center gap-2">
          {#if response}
            <button
              onclick={() => {
                void copyText(prettyResponseBody());
                showToast('Body copied to clipboard', 'success');
              }}
              class="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
              title="Copy body"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              onclick={() => (response = null)}
              class="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
              title="Clear response"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          {/if}

          <!-- Response tabs -->
          <div class="flex items-center">
            <button
              onclick={() => (activeResponseTab = 'body')}
              class="px-3 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px {activeResponseTab === 'body'
                ? 'text-neutral-900 dark:text-white border-neutral-900 dark:border-white'
                : 'text-neutral-400 dark:text-neutral-500 border-transparent hover:text-neutral-600 dark:hover:text-neutral-300'}"
            >
              Body
            </button>
            <button
              onclick={() => (activeResponseTab = 'headers')}
              class="px-3 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px {activeResponseTab === 'headers'
                ? 'text-neutral-900 dark:text-white border-neutral-900 dark:border-white'
                : 'text-neutral-400 dark:text-neutral-500 border-transparent hover:text-neutral-600 dark:hover:text-neutral-300'}"
            >
              Headers
            </button>
          </div>
        </div>
      </div>

      <!-- Response Content -->
      <div class="flex-1 overflow-y-auto">
        {#if !response}
          <div class="h-full flex items-center justify-center py-12">
            <div class="text-center space-y-2">
              <svg class="w-12 h-12 mx-auto text-neutral-300 dark:text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              <p class="text-sm text-neutral-400 dark:text-neutral-500">No response yet</p>
              <p class="text-xs text-neutral-300 dark:text-neutral-600">Configure a request and click <span class="font-medium">Send</span> (or press <kbd class="px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-[10px] font-mono">Ctrl+Enter</kbd>)</p>
            </div>
          </div>
        {:else if activeResponseTab === 'body'}
          <div class="p-3">
            <pre
              class="text-xs font-mono bg-neutral-900/95 dark:bg-neutral-950 text-emerald-300 p-4 rounded-lg overflow-x-auto whitespace-pre-wrap break-all max-h-full"
            >{prettyResponseBody() || '(empty response body)'}</pre>
          </div>
        {:else}
          <div class="p-3">
            {#if Object.keys(response.headers).length === 0}
              <p class="text-xs text-neutral-400 dark:text-neutral-500 italic py-4 text-center">No response headers captured.</p>
            {:else}
              <table class="w-full text-xs">
                <thead>
                  <tr class="border-b border-neutral-200 dark:border-neutral-800">
                    <th class="text-left py-1.5 pr-3 font-semibold text-neutral-500 dark:text-neutral-400 w-1/3">Header</th>
                    <th class="text-left py-1.5 font-semibold text-neutral-500 dark:text-neutral-400">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {#each Object.entries(response.headers) as [name, val] (name)}
                    <tr class="border-b border-neutral-100 dark:border-neutral-800/50 hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors">
                      <td class="py-1.5 pr-3 font-mono text-neutral-600 dark:text-neutral-300">{name}</td>
                      <td class="py-1.5 font-mono text-neutral-900 dark:text-neutral-100 break-all">{val}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
