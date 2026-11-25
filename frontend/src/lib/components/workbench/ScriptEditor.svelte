<script lang="ts">
  import CodeEditor from './CodeEditor.svelte';

  let {
    pre = '',
    post = '',
    onPre = (_v: string) => {},
    onPost = (_v: string) => {}
  }: {
    pre?: string;
    post?: string;
    onPre?: (v: string) => void;
    onPost?: (v: string) => void;
  } = $props();

  let which = $state<'pre' | 'post'>('pre');

  const SNIPPETS: Record<'pre' | 'post', [string, string][]> = {
    pre: [
      ['Set an environment variable', "pm.environment.set('key', 'value');"],
      ['Set a collection variable', "pm.collectionVariables.set('key', 'value');"],
      ['Timestamp variable', "pm.variables.set('now', Date.now());"],
      ['Add a header', "pm.request.headers.upsert({ key: 'X-Request-Id', value: pm.variables.replaceIn('{{$guid}}') });"],
      ['HMAC-SHA256 signature', "const body = pm.request.body.raw || '';\nconst sig = CryptoJS.HmacSHA256(body, pm.environment.get('secret')).toString(CryptoJS.enc.Hex);\npm.request.headers.upsert({ key: 'X-Signature', value: sig });"],
      ['Log a variable', "console.log(pm.variables.get('key'));"]
    ],
    post: [
      ['Status code is 200', "pm.test('Status code is 200', () => {\n  pm.response.to.have.status(200);\n});"],
      ['Response time < 500ms', "pm.test('Response time is below 500ms', () => {\n  pm.expect(pm.response.responseTime).to.be.below(500);\n});"],
      ['JSON value check', "pm.test('Has expected value', () => {\n  const json = pm.response.json();\n  pm.expect(json.key).to.eql('value');\n});"],
      ['Body contains string', "pm.test('Body contains string', () => {\n  pm.expect(pm.response.text()).to.include('string');\n});"],
      ['Header is present', "pm.test('Content-Type is present', () => {\n  pm.response.to.have.header('Content-Type');\n});"],
      ['Save token from response', "const json = pm.response.json();\npm.environment.set('token', json.token);"]
    ]
  };

  function insert(code: string) {
    const cur = which === 'pre' ? pre : post;
    const next = (cur.trim() ? cur.replace(/\s*$/, '') + '\n\n' : '') + code + '\n';
    if (which === 'pre') onPre(next);
    else onPost(next);
  }
</script>

<div class="flex flex-col h-full min-h-[260px] gap-2">
  <div class="flex items-center gap-2">
    <div class="wb-seg">
      <button class={which === 'pre' ? 'is-active' : ''} onclick={() => (which = 'pre')}>
        Pre-request{#if pre.trim()}<span class="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-brand-500 align-middle"></span>{/if}
      </button>
      <button class={which === 'post' ? 'is-active' : ''} onclick={() => (which = 'post')}>
        Post-response{#if post.trim()}<span class="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-brand-500 align-middle"></span>{/if}
      </button>
    </div>
    <span class="text-[11px] text-neutral-400 hidden lg:inline">Postman <code class="font-mono">pm.*</code> API · sandboxed</span>
  </div>
  <div class="flex-1 min-h-0 flex gap-2">
    <div class="flex-1 min-w-0 rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      {#if which === 'pre'}
        <CodeEditor value={pre} language="javascript" placeholder="// Runs before the request is sent" onchange={onPre} />
      {:else}
        <CodeEditor value={post} language="javascript" placeholder="// Runs after the response arrives — write pm.test(...) here" onchange={onPost} />
      {/if}
    </div>
    <div class="w-44 shrink-0 hidden md:flex flex-col gap-0.5 overflow-y-auto wb-scroll">
      <p class="px-2 pb-1 text-[10.5px] uppercase tracking-wide text-neutral-400">Snippets</p>
      {#each SNIPPETS[which] as [label, code] (label)}
        <button class="text-left px-2 py-1 rounded-md text-[11.5px] text-brand-600 dark:text-brand-400 hover:bg-brand-500/10 transition-colors" onclick={() => insert(code)}>{label}</button>
      {/each}
    </div>
  </div>
</div>
