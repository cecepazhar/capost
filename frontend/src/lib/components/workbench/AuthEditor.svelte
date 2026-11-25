<script lang="ts">
  import type { AuthConfig, AuthType } from '$lib/stores/workbench.svelte';

  let {
    auth,
    onchange = () => {},
    allowInherit = true,
    inheritedFrom = ''
  }: {
    auth: AuthConfig;
    onchange?: () => void;
    allowInherit?: boolean;
    /** Human label of where an inherited auth comes from. */
    inheritedFrom?: string;
  } = $props();

  const TYPES: [AuthType, string][] = [
    ['inherit', 'Inherit'],
    ['none', 'No Auth'],
    ['bearer', 'Bearer'],
    ['basic', 'Basic'],
    ['digest', 'Digest'],
    ['apikey', 'API Key'],
    ['oauth2', 'OAuth 2.0']
  ];

  function set(t: AuthType) {
    auth.type = t;
    onchange();
  }
</script>

<div class="space-y-4 max-w-xl">
  <div class="wb-seg flex-wrap">
    {#each TYPES.filter(([k]) => allowInherit || k !== 'inherit') as [k, label] (k)}
      <button class={auth.type === k ? 'is-active' : ''} onclick={() => set(k)}>{label}</button>
    {/each}
  </div>

  {#if auth.type === 'inherit'}
    <p class="text-[12px] text-neutral-500">
      Uses the authorization of its parent folder or collection{#if inheritedFrom}: <span class="font-medium text-neutral-700 dark:text-neutral-300">{inheritedFrom}</span>{/if}.
    </p>
  {:else if auth.type === 'bearer'}
    <label class="wb-field">
      <span>Token</span>
      <input class="wb-input" bind:value={auth.bearerToken} oninput={onchange} placeholder={'{{token}}'} spellcheck="false" />
    </label>
  {:else if auth.type === 'basic' || auth.type === 'digest'}
    <div class="grid grid-cols-2 gap-3">
      <label class="wb-field"><span>Username</span><input class="wb-input" bind:value={auth.basicUser} oninput={onchange} spellcheck="false" /></label>
      <label class="wb-field"><span>Password</span><input type="password" class="wb-input" bind:value={auth.basicPass} oninput={onchange} /></label>
    </div>
    {#if auth.type === 'digest'}
      <p class="text-[11.5px] text-neutral-500">CAPost answers the server's 401 Digest challenge automatically (MD5, qop=auth).</p>
    {/if}
  {:else if auth.type === 'apikey'}
    <div class="grid grid-cols-2 gap-3">
      <label class="wb-field"><span>Key</span><input class="wb-input" bind:value={auth.apiKeyName} oninput={onchange} spellcheck="false" /></label>
      <label class="wb-field"><span>Value</span><input class="wb-input" bind:value={auth.apiKeyValue} oninput={onchange} spellcheck="false" /></label>
    </div>
    <div class="wb-seg">
      {#each [['header', 'Header'], ['query', 'Query param']] as [k, label] (k)}
        <button
          class={auth.apiKeyAddTo === k ? 'is-active' : ''}
          onclick={() => {
            auth.apiKeyAddTo = k as 'header' | 'query';
            onchange();
          }}>{label}</button
        >
      {/each}
    </div>
  {:else if auth.type === 'oauth2'}
    <label class="wb-field">
      <span>Access token</span>
      <input class="wb-input" bind:value={auth.oauth2Token} oninput={onchange} placeholder={'{{access_token}}'} spellcheck="false" />
    </label>
    <div class="grid grid-cols-2 gap-3">
      <label class="wb-field"><span>Header prefix</span><input class="wb-input" bind:value={auth.oauth2Prefix} oninput={onchange} spellcheck="false" /></label>
      <label class="wb-field">
        <span>Add token to</span>
        <select
          class="wb-input"
          value={auth.oauth2AddTo ?? 'header'}
          onchange={(e) => {
            auth.oauth2AddTo = (e.target as HTMLSelectElement).value as 'header' | 'query';
            onchange();
          }}
        >
          <option value="header">Request header</option>
          <option value="query">Query param (access_token)</option>
        </select>
      </label>
    </div>
    <p class="text-[11.5px] text-neutral-500">Paste an existing token, or fetch one in a pre-request script and store it with <code class="font-mono">pm.environment.set('access_token', …)</code>.</p>
  {:else}
    <p class="text-[12px] text-neutral-400">No authorization is sent.</p>
  {/if}
</div>
