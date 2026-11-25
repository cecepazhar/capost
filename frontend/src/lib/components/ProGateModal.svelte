<script lang="ts">
  import { proGate } from '$lib/stores/proGate.svelte';
  import { billingStore, isPro, licenseInfo } from '$lib/stores/billing.svelte';
  import { showToast } from '$lib/stores/uiNotifications.svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { errorText } from '$lib/errors';
  import LicenseActivation from './LicenseActivation.svelte';

  let activeTab = $state<'trial' | 'creem' | 'activate'>('trial');
  let isStartingTrial = $state(false);
  let errorMessage = $state<string | null>(null);

  // The trial is once per device: once used, open straight on licence activation.
  $effect(() => {
    if ($proGate.isOpen && $licenseInfo.trialUsed && activeTab === 'trial') activeTab = 'activate';
  });
  // A licence activated from inside the modal unlocks the feature: close it.
  $effect(() => {
    if ($proGate.isOpen && $isPro) proGate.close();
  });

  const CREEM_CHECKOUT_URL = 'https://creem.io/checkout/capost-pro';

  async function handleStartTrial() {
    isStartingTrial = true;
    errorMessage = null;
    try {
      await billingStore.startTrial();
      showToast('Trial 7 Hari CAPost PRO berhasil diaktifkan!', 'success');
      proGate.close();
    } catch (err: any) {
      errorMessage = errorText(err) || 'Gagal memulai trial. Silakan coba lagi.';
      showToast(errorMessage!, 'error');
    } finally {
      isStartingTrial = false;
    }
  }

  async function handleBuyCreem() {
    try {
      await invoke('open_external_url', { url: CREEM_CHECKOUT_URL });
    } catch {
      if (typeof window !== 'undefined') {
        window.open(CREEM_CHECKOUT_URL, '_blank');
      }
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      proGate.close();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if $proGate.isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs select-none">
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pro-gate-title"
      class="w-full max-w-lg bg-white dark:bg-[#121217] border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-neutral-900 dark:text-neutral-100"
    >
      <!-- Modal Header -->
      <div class="p-6 border-b border-neutral-100 dark:border-neutral-800/80 bg-neutral-50/50 dark:bg-neutral-900/40 relative">
        <button
          type="button"
          onclick={() => proGate.close()}
          class="absolute top-5 right-5 text-neutral-400 hover:text-neutral-700 dark:hover:text-white p-1 rounded-lg hover:bg-neutral-200/50 dark:hover:bg-neutral-800 transition-colors"
          title="Tutup"
          aria-label="Tutup"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-emerald-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-lg shadow-[0_0_15px_rgba(245,158,11,0.2)]">
            ★
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 id="pro-gate-title" class="text-lg font-bold tracking-tight">CAPost PRO</h2>
              <span class="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                Studio Edition
              </span>
            </div>
            <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              {$proGate.featureTitle || 'Fitur AI & Runner'}
            </p>
          </div>
        </div>

        <!-- Clean Pro Gate Alert Note -->
        <div class="mt-4 p-3 rounded-xl bg-amber-500/10 dark:bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
          <span class="font-semibold block mb-0.5">Akses PRO Diperlukan</span>
          {$proGate.reason}
        </div>
      </div>

      <!-- Feature Matrix Pills -->
      <div class="px-6 py-3 border-b border-neutral-100 dark:border-neutral-800/80 bg-neutral-100/40 dark:bg-neutral-900/20 grid grid-cols-3 gap-2 text-[11px]">
        <div class="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300">
          <span class="text-emerald-500 font-bold">✓</span>
          <span>BYOK AI Copilot</span>
        </div>
        <div class="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300">
          <span class="text-emerald-500 font-bold">✓</span>
          <span>Ambient Lighting</span>
        </div>
        <div class="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300">
          <span class="text-emerald-500 font-bold">✓</span>
          <span>Unlimited Runner (&gt;10)</span>
        </div>
      </div>

      <!-- Tab Buttons (3 Options) -->
      <div class="flex border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold">
        <button
          type="button"
          onclick={() => { activeTab = 'trial'; errorMessage = null; }}
          class="flex-1 py-3 px-2 text-center transition-colors border-b-2 {activeTab === 'trial'
            ? 'border-brand-500 text-brand-600 dark:text-brand-400 bg-brand-500/5'
            : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'}"
        >
          Trial 7 Hari
        </button>
        <button
          type="button"
          onclick={() => { activeTab = 'creem'; errorMessage = null; }}
          class="flex-1 py-3 px-2 text-center transition-colors border-b-2 {activeTab === 'creem'
            ? 'border-brand-500 text-brand-600 dark:text-brand-400 bg-brand-500/5'
            : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'}"
        >
          Beli via Creem
        </button>
        <button
          type="button"
          onclick={() => { activeTab = 'activate'; errorMessage = null; }}
          class="flex-1 py-3 px-2 text-center transition-colors border-b-2 {activeTab === 'activate'
            ? 'border-brand-500 text-brand-600 dark:text-brand-400 bg-brand-500/5'
            : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'}"
        >
          Aktivasi Lisensi
        </button>
      </div>

      <!-- Tab Content Area -->
      <div class="p-6 space-y-4">
        {#if errorMessage}
          <div class="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs">
            {errorMessage}
          </div>
        {/if}

        {#if activeTab === 'trial'}
          <div class="space-y-4">
            <div class="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              Mulai uji coba gratis CAPost PRO selama <strong class="text-neutral-900 dark:text-white">7 hari penuh</strong> tanpa kartu kredit. Akses instan ke AI Copilot (API key sendiri), Runner tanpa batas, dan Ambient Lighting. Sekali per perangkat.
            </div>

            <button
              type="button"
              onclick={handleStartTrial}
              disabled={isStartingTrial || $licenseInfo.trialUsed}
              class="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-brand-600 hover:bg-brand-500 active:scale-[0.99] transition-all shadow-md shadow-brand-600/20 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {#if isStartingTrial}
                <span class="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
                <span>Mengaktifkan Trial...</span>
              {:else}
                <span>✨</span>
                <span>Mulai Trial 7 Hari (Gratis)</span>
              {/if}
            </button>
          </div>
        {:else if activeTab === 'creem'}
          <div class="space-y-4">
            <div class="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              Beli lisensi resmi CAPost PRO melalui payment gateway resmi <strong class="text-neutral-900 dark:text-white">Creem</strong>. Mendukung pembayaran lokal dan internasional. Kunci lisensi dikirim otomatis ke email Anda.
            </div>

            <button
              type="button"
              onclick={handleBuyCreem}
              class="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] transition-all shadow-md shadow-emerald-600/20 cursor-pointer flex items-center justify-center gap-2"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              <span>Beli Lisensi Pro via Creem</span>
            </button>

            <p class="text-[11px] text-neutral-500 dark:text-neutral-500 text-center">
              Setelah pembayaran berhasil, buka tab "Aktivasi Lisensi" untuk memasukkan kunci Anda.
            </p>
          </div>
        {:else}
          <LicenseActivation />
        {/if}
      </div>

      <!-- Modal Footer -->
      <div class="px-6 py-3 border-t border-neutral-100 dark:border-neutral-800/80 bg-neutral-50/50 dark:bg-neutral-900/40 flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
        <span>Zero-Knowledge &amp; BYOK Sovereign AI</span>
        <button
          type="button"
          onclick={() => proGate.close()}
          class="hover:text-neutral-900 dark:hover:text-white transition-colors"
        >
          Tutup
        </button>
      </div>
    </div>
  </div>
{/if}
