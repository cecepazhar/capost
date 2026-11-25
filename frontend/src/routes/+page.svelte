<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  // The dashboard is the home screen; the request workbench is one click away in the sidebar.
  onMount(() => {
    goto('/dashboard', { replaceState: true });
  });
</script>
