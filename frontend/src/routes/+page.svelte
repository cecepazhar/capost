<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  // The request workbench is the home screen; render it full-bleed under /requests.
  onMount(() => {
    goto('/requests', { replaceState: true });
  });
</script>
