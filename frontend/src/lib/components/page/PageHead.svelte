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

<!-- Workbench-style toolbar: one 48px strip, title + hint on the left, actions on the right. -->
<header class="cp-toolbar">
  <h1 class="text-[13.5px] font-semibold text-neutral-900 dark:text-white shrink-0">{title}</h1>
  {#if subtitle || meta}
    <p class="hidden lg:block min-w-0 truncate text-[12px] text-neutral-500 dark:text-neutral-400">
      {subtitle}{#if meta}{@render meta()}{/if}
    </p>
  {/if}
  {#if actions}
    <div class="ml-auto flex items-center gap-1.5 shrink-0">{@render actions()}</div>
  {/if}
</header>
