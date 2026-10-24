<script lang="ts">
  import { PageContainer, PageHeader, EmptyState } from '@cecepazhar/caui';
  import { t } from '$lib/i18n/index.svelte';
</script>

<PageContainer class="p-6 space-y-6 max-w-7xl mx-auto">
  <PageHeader
    title={t('nav.mock')}
    subtitle="Local API mock server generated from JSON schema"
    accent="indigo"
  />

  <EmptyState
    icon="code"
    title={t('nav.mock')}
    description="Spin up a local mock server from OpenAPI / JSON Schema definitions, with latency, status codes, and fixture data."
  />
</PageContainer>
