<script lang="ts">
  import RequestsWorkbench from '$lib/components/RequestsWorkbench.svelte';
  import { goto } from '$app/navigation';
</script>

<div class="h-full w-full flex flex-col p-4 md:p-6 max-w-7xl mx-auto">
  <RequestsWorkbench
    onNavigateToCollection={() => goto('/collections')}
    onNavigateToEnvironments={() => goto('/environments')}
    onNavigateToHistory={() => goto('/history')}
  />
</div>
