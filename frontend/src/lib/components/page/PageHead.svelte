<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    subtitle?: string;
    actions?: Snippet;
    meta?: Snippet;
  }
  let { title, subtitle = '', actions, meta }: Props = $props();
</script>

<header class="cp-page-head">
  <div class="min-w-0">
    <h1 class="cp-title">{title}</h1>
    {#if subtitle || meta}
      <p class="cp-subtitle">
        {subtitle}{#if meta}{@render meta()}{/if}
      </p>
    {/if}
  </div>
  {#if actions}
    <div class="flex items-center gap-2 shrink-0">{@render actions()}</div>
  {/if}
</header>
