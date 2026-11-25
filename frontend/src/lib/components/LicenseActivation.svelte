<script lang="ts">
  // Licence key input + activate button. Used on Settings → CAPost Pro and, while on the Free
  // plan, on Settings → Profile (same place CATerm puts it).
  import { billingStore, LICENSE_KEY_PATTERN } from '$lib/stores/billing.svelte';
  import { showToast } from '$lib/stores/uiNotifications.svelte';
  import { openExternalUrl } from '$lib/utils/url';
  import { PRICING_URL } from '$lib/appInfo';
  import { t } from '$lib/i18n/index.svelte';

  let { compact = false }: { compact?: boolean } = $props();

  let key = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);

  // Keys are case-insensitive; show them the way the purchase email does.
  function onInput(e: Event) {
    const el = e.target as HTMLInputElement;
    key = el.value.toUpperCase().replace(/\s+/g, '');
    error = null;
  }

  async function activate(e?: Event) {
    e?.preventDefault();
    const clean = key.trim().toUpperCase();
    if (!clean) {
      error = t('settings.license.errEmpty');
      return;
    }
    if (!LICENSE_KEY_PATTERN.test(clean)) {
      error = t('settings.license.errFormat');
      return;
    }
    busy = true;
    error = null;
    try {
      await billingStore.activateLicense(clean);
      key = '';
      showToast(t('settings.license.activated'), 'success');
    } catch {
      // The backend refuses bad check digits / unknown products with a validation error.
      error = t('settings.license.errFormat');
    } finally {
      busy = false;
    }
  }
</script>

<form onsubmit={activate} class="space-y-3">
  {#if !compact}
    <div>
      <h3 class="text-[14px] font-semibold text-neutral-900 dark:text-white">{t('settings.license.activateTitle')}</h3>
      <p class="mt-0.5 cp-muted">{t('settings.license.activateBody')}</p>
    </div>
  {/if}
  <div class="flex flex-col sm:flex-row gap-2">
    <label class="sr-only" for="license-key-{compact ? 'c' : 'f'}">{t('settings.license.keyLabel')}</label>
    <input
      id="license-key-{compact ? 'c' : 'f'}"
      type="text"
      value={key}
      oninput={onInput}
      placeholder="CAPS99-XXXXXX-0"
      autocomplete="off"
      spellcheck="false"
      maxlength="20"
      class="cp-input !h-9 flex-1 font-mono tracking-wider uppercase {error ? '!border-rose-500/70' : ''}"
      aria-invalid={!!error}
    />
    <button type="submit" class="cp-btn cp-btn-primary !h-9 shrink-0 min-w-28 justify-center" disabled={busy || !key.trim()}>
      {busy ? t('settings.license.activating') : t('settings.license.activate')}
    </button>
  </div>
  {#if error}
    <p class="text-[12px] text-rose-600 dark:text-rose-400">{error}</p>
  {:else}
    <p class="text-[11.5px] cp-muted flex flex-wrap items-center gap-x-1.5">
      <span>{t('settings.license.keyHint')}</span>
      <span aria-hidden="true">·</span>
      <span>{t('settings.license.noKey')}</span>
      <button type="button" class="text-brand-600 dark:text-brand-400 hover:underline" onclick={() => openExternalUrl(PRICING_URL)}>
        {t('settings.license.buy')} ↗
      </button>
    </p>
  {/if}
</form>
