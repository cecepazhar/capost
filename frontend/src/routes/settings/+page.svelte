<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { changeMasterPassword, MIN_VAULT_PASSWORD_LEN } from '$lib/api/vault';
  import { exportEncryptedBackup, importEncryptedBackup } from '$lib/api/backup';
  import AiSettingsForm from '$lib/components/AiSettingsForm.svelte';
  import ProfileAvatar from '$lib/components/ProfileAvatar.svelte';
  import AvatarPicker from '$lib/components/AvatarPicker.svelte';
  import { showToast, confirmModal } from '$lib/stores/uiNotifications.svelte';
  import { relaunch } from '@tauri-apps/plugin-process';
  import { getProfile, saveProfile } from '$lib/stores/profile.svelte';
  import { getAppearance, setReduceMotion } from '$lib/stores/appearance.svelte';
  import { getUpdater, checkForUpdates, installUpdate } from '$lib/stores/updater.svelte';
  import { APP_VERSION, releaseNotesUrl } from '$lib/appInfo';
  import { openExternalUrl } from '$lib/utils/url';
  import { errorText } from '$lib/errors';
	import { getPerformancePrefs, setPerformancePrefs, type PerformancePrefs } from '$lib/api/performance';
  import { t } from '$lib/i18n/index.svelte';
  import { SHORTCUT_GROUPS } from '$lib/shortcuts';
  import PageHead from '$lib/components/page/PageHead.svelte';
  import AmbientSettingsCard from '$lib/components/AmbientSettingsCard.svelte';
  import { isPro, billingStore, licenseInfo } from '$lib/stores/billing.svelte';
  import LicenseActivation from '$lib/components/LicenseActivation.svelte';
  import { proGate } from '$lib/stores/proGate.svelte';

  // Shared surface classes so every tab reads the same in light and dark mode.
  const CARD = 'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-6 shadow-sm dark:shadow-none text-neutral-900 dark:text-white';
  const SUBCARD = 'border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 bg-neutral-50 dark:bg-neutral-950';
  const MUTED = 'text-neutral-500 dark:text-neutral-400';

  // ---- CAPost Pro (offline licence key / 7-day trial, see lib/stores/billing) -------------
  const billing = billingStore;
  let trialBusy = $state(false);

  const isTrial = $derived($billing.isPro && $billing.billingType === 'trial');
  const trialDaysLeft = $derived.by(() => {
    if (!isTrial || !$billing.expiresAt) return 0;
    return Math.max(0, Math.ceil((new Date($billing.expiresAt).getTime() - Date.now()) / 86_400_000));
  });
  const planLabel = $derived(
    !$billing.isPro
      ? t('settings.license.planFree')
      : isTrial
        ? t('settings.license.planTrial')
        : $billing.billingType === 'lifetime'
          ? t('settings.license.planLifetime')
          : $billing.billingType === 'yearly'
            ? t('settings.license.planYearly')
            : t('settings.license.planPro')
  );
  const planBody = $derived(
    !$billing.isPro
      ? t('settings.license.planFreeBody')
      : isTrial
        ? t('settings.license.planTrialBody', { count: trialDaysLeft })
        : t('settings.license.planProBody')
  );
  const compareRows = $derived([
    { label: t('settings.license.featRequests'), free: '✓', pro: '✓' },
    { label: t('settings.license.featPostman'), free: '✓', pro: '✓' },
    { label: t('settings.license.featVault'), free: '✓', pro: '✓' },
    { label: t('settings.license.featUpdates'), free: '✓', pro: '✓' },
    { label: t('settings.license.featRunner'), free: t('settings.license.featRunnerFree'), pro: t('settings.license.featRunnerPro') },
    { label: t('settings.license.featAi'), free: '—', pro: '✓' },
    { label: t('settings.license.featAmbient'), free: '—', pro: '✓' }
  ]);

  $effect(() => {
    if (activeTab === 'pro') void billingStore.refresh().catch(() => {});
  });

  async function startTrial() {
    trialBusy = true;
    try {
      await billingStore.startTrial();
      showToast(t('settings.license.trialStarted'), 'success');
    } catch (err) {
      showToast(errorText(err), 'error');
    } finally {
      trialBusy = false;
    }
  }

  async function deactivateLicense() {
    const ok = await confirmModal(
      t('settings.license.deactivateBody'),
      t('settings.license.deactivateTitle'),
      true,
      t('settings.license.deactivate'),
      t('common.cancel')
    );
    if (!ok) return;
    try {
      await billingStore.signOut();
      await billingStore.refresh().catch(() => {}); // a running trial stays active
      showToast(t('settings.license.deactivated'), 'info');
    } catch (err) {
      showToast(errorText(err), 'error');
    }
  }

  const LABEL_BASE = 'block text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase';
  const LABEL = `${LABEL_BASE} mb-1`;
  const INPUT = 'w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded text-sm text-neutral-900 dark:text-white focus:outline-none focus:border-sky-500';
  const EYE_BUTTON = 'absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors p-1';

  const TABS = ['profile', 'pro', 'updates', 'ai', 'security', 'backup', 'performance', 'shortcuts'] as const;
  type SettingsTab = (typeof TABS)[number];
  // `?tab=` lets the profile menu / Upgrade buttons deep-link straight to a tab
  // (`subscription` from older links lands on CAPost Pro).
  const requestedTab = (page.url.searchParams.get('tab') ?? '').replace('subscription', 'pro');
  let activeTab = $state<SettingsTab>((TABS as readonly string[]).includes(requestedTab) ? (requestedTab as SettingsTab) : 'profile');
  const visibleTabs = TABS;

  const updater = getUpdater();
  const downloadPercent = $derived(
    updater.progress.total ? Math.round((updater.progress.downloaded / updater.progress.total) * 100) : null
  );

  // Profile (Free plan: display name + preset avatar)
  const profile = getProfile();
  const appearance = getAppearance();
  let profileName = $state(profile.name);
  let profileAvatar = $state(profile.avatar);
  const profileDirty = $derived(profileName.trim() !== profile.name || profileAvatar !== profile.avatar);

  function handleSaveProfile(e: Event) {
    e.preventDefault();
    saveProfile({ name: profileName, avatar: profileAvatar });
    profileName = profile.name;
    showToast(t('settings.profile.saved'), 'success');
  }

  // Master password change (re-keys the encrypted database)
  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');
  let showPasswords = $state(false);
  let isChangingPassword = $state(false);

  // Audit Logs Setting
  let maxAuditRecords = $state(1000);

  onMount(() => {
    try {
      const stored = localStorage.getItem('capost_max_audit_records');
      if (stored) maxAuditRecords = parseInt(stored, 10) || 1000;
    } catch {}
		getPerformancePrefs()
			.then((prefs) => {
				gpuAcceleration = prefs.gpuAcceleration ?? false;
				backgroundMemorySaving = prefs.backgroundMemorySaving ?? true;
				scrollbackLines = prefs.scrollbackLines ?? 5000;
				inactiveSessionSleep = prefs.inactiveSessionSleep ?? true;
				lowPowerMode = prefs.lowPowerMode ?? false;
			})
			.catch(() => {}); // browser preview: no backend, keep default
	});

	// Performance preferences state
	let gpuAcceleration = $state(false);
	let backgroundMemorySaving = $state(true);
	let scrollbackLines = $state(5000);
	let inactiveSessionSleep = $state(true);
	let lowPowerMode = $state(false);
	let isSavingPerformance = $state(false);

	async function saveAllPerformancePrefs(partial: Partial<PerformancePrefs>, isGpuChange = false) {
		isSavingPerformance = true;
		const updated: PerformancePrefs = {
			gpuAcceleration: partial.gpuAcceleration ?? gpuAcceleration,
			backgroundMemorySaving: partial.backgroundMemorySaving ?? backgroundMemorySaving,
			scrollbackLines: partial.scrollbackLines ?? scrollbackLines,
			inactiveSessionSleep: partial.inactiveSessionSleep ?? inactiveSessionSleep,
			lowPowerMode: partial.lowPowerMode ?? lowPowerMode
		};
		try {
			await setPerformancePrefs(updated);
			gpuAcceleration = updated.gpuAcceleration;
			backgroundMemorySaving = updated.backgroundMemorySaving;
			scrollbackLines = updated.scrollbackLines;
			inactiveSessionSleep = updated.inactiveSessionSleep;
			lowPowerMode = updated.lowPowerMode;
			if (!isGpuChange) {
				showToast(t('settings.performance.saved'), 'success');
			}
		} catch (err) {
			showToast(t('settings.performance.saveFailed', { error: errorText(err) }), 'error');
			return;
		} finally {
			isSavingPerformance = false;
		}

		if (isGpuChange) {
			const restart = await confirmModal(
				t('settings.performance.restartBody'),
				t('settings.performance.restartTitle'),
				false,
				t('settings.performance.restartNow'),
				t('settings.performance.later')
			);
			if (restart) await relaunch();
		}
	}

  function handleSaveAuditSettings(e: Event) {
    e.preventDefault();
    try {
      localStorage.setItem('capost_max_audit_records', maxAuditRecords.toString());
      showToast(t('settings.audit.saved', { count: maxAuditRecords }), 'success');
    } catch {
      showToast(t('settings.audit.saveFailed'), 'error');
    }
  }

  let backupPassphrase = $state('');
  let showBackupPassphrase = $state(false);
  let backupMsg = $state('');
  let backupMsgKind = $state<'success' | 'error'>('success');
  let restorePassphrase = $state('');
  let showRestorePassphrase = $state(false);
  let restoreMsg = $state('');
  let restoreMsgKind = $state<'success' | 'error'>('success');

  async function handleExport(e: Event) {
    e.preventDefault();
    if (backupPassphrase.length < 8) {
      showToast(t('settings.backup.errPassphrase'), 'error');
      return;
    }

    try {
      showToast(t('settings.backup.creating'), 'info');
      const b64 = await exportEncryptedBackup(backupPassphrase);
      
      const blob = new Blob([b64], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `capost-backup-${new Date().toISOString().split('T')[0]}.catb`;
      a.click();
      URL.revokeObjectURL(url);

      showToast(t('settings.backup.savedToast'), 'success');
      backupPassphrase = '';
    } catch (err: any) {
      showToast(err?.message || t('settings.backup.exportFailed'), 'error');
    }
  }

  async function handleImport(e: Event) {
    e.preventDefault();
    if (restorePassphrase.length < 8) {
      showToast(t('settings.backup.errPassphrase'), 'error');
      return;
    }

    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.catb,.enc,.txt';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        
        showToast(t('settings.backup.importing'), 'info');
        
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const b64 = event.target?.result as string;
            const importedCount = await importEncryptedBackup(b64, restorePassphrase);
            showToast(t('settings.backup.restored', { count: importedCount }), 'success');
            restorePassphrase = '';
          } catch (err: any) {
            showToast(err?.message || t('settings.backup.restoreFailed'), 'error');
          }
        };
        reader.readAsText(file);
      };
      input.click();
    } catch (err: any) {
      showToast(err?.message || t('settings.backup.restoreFailed'), 'error');
    }
  }

  async function handleChangeMasterPassword(e: Event) {
    e.preventDefault();
    if (newPassword.length < MIN_VAULT_PASSWORD_LEN) {
      showToast(t('settings.security.errMin', { min: MIN_VAULT_PASSWORD_LEN }), 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast(t('settings.security.errMismatch'), 'error');
      return;
    }
    isChangingPassword = true;
    try {
      await changeMasterPassword(currentPassword, newPassword);
      currentPassword = '';
      newPassword = '';
      confirmPassword = '';
      const restartNow = await confirmModal(
        t('settings.security.changedConfirm'),
        t('settings.security.changedTitle'),
        false,
        t('settings.security.restartNow'),
        t('settings.security.later')
      );
      if (restartNow) {
        await relaunch();
        return;
      }
      showToast(t('settings.security.changedToast'), 'success');
    } catch (err) {
      showToast(errorText(err), 'error');
    } finally {
      isChangingPassword = false;
    }
  }
</script>

<div class="cp-view">
  <PageHead title={t('settings.title')} subtitle={t('settings.subtitle')} />

  <div class="cp-body">
  <!-- Settings sections: vertical nav, full height (VS Code / Postman style) -->
  <nav class="cp-side cp-pane w-56 p-2 space-y-0.5 overflow-y-auto" role="tablist" aria-orientation="vertical">
    {#each visibleTabs as tab (tab)}
      <button
        role="tab"
        aria-selected={activeTab === tab}
        onclick={() => (activeTab = tab)}
        class="cp-list-item {activeTab === tab ? 'is-active font-medium' : 'text-neutral-600 dark:text-neutral-400'}"
      >
        {t(`settings.tabs.${tab}`)}
      </button>
    {/each}
  </nav>

  <div class="cp-scroll">
  <div class="w-full max-w-5xl px-8 py-6 space-y-6">

  {#if activeTab === 'profile'}
    <div class="{CARD} space-y-6">
      <div class="flex items-center gap-4">
        <ProfileAvatar avatar={profileAvatar} name={profileName} size={56} pro={$isPro} />
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h2 class="text-lg font-semibold text-neutral-900 dark:text-white truncate">{profileName.trim() || profile.name}</h2>
            {#if $isPro}
              <span class="text-[10px] font-semibold tracking-wider px-1.5 py-0.5 rounded border border-brand-500/40 bg-brand-500/10 text-brand-600 dark:text-brand-400 uppercase">{t('profileMenu.planPro')}</span>
            {:else}
              <span class="text-[10px] font-semibold tracking-wider px-1.5 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 uppercase">{t('profileMenu.planFree')}</span>
            {/if}
          </div>
          <p class="{MUTED} text-sm">{t('settings.profile.localNote')}</p>
        </div>
      </div>

      <form onsubmit={handleSaveProfile} class="space-y-5 max-w-md">
        <div>
          <label for="profile-name" class={LABEL}>{t('settings.profile.displayName')}</label>
          <input
            id="profile-name"
            type="text"
            maxlength="48"
            bind:value={profileName}
            placeholder={"User"}
            class={INPUT} />
        </div>
        <div>
          <span class="{LABEL_BASE} mb-2">{t('settings.profile.picture')}</span>
          <AvatarPicker bind:value={profileAvatar} size={40} />
        </div>
        <button
          type="submit"
          disabled={!profileDirty}
          class="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:hover:bg-sky-600 text-white text-sm font-medium rounded-md transition-colors shadow-sm">
          {t('settings.profile.save')}
        </button>
      </form>

      <div class="pt-5 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-4">
        <div>
          <p class="text-sm font-medium text-neutral-900 dark:text-white">{t('settings.profile.masterPassword')}</p>
          <p class="text-xs {MUTED}">{t('settings.profile.masterPasswordBody')}</p>
        </div>
        <button
          onclick={() => (activeTab = 'security')}
          class="px-3 py-1.5 text-xs font-medium rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
          {t('settings.profile.changeMasterPassword')}
        </button>
      </div>

    </div>

    <!-- Licence: activate right here while on Free (as in CATerm); manage it on CAPost Pro. -->
    {#if !$isPro}
      <div class={CARD}>
        <LicenseActivation />
      </div>
    {:else}
      <div class="{CARD} flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-neutral-900 dark:text-white">CAPost {planLabel}</p>
          <p class="text-xs {MUTED} mt-0.5">{planBody}</p>
        </div>
        <button type="button" class="cp-btn shrink-0" onclick={() => (activeTab = 'pro')}>{t('settings.tabs.pro')} →</button>
      </div>
    {/if}

    <!-- PRO Ambient Underglow Lighting Card -->
    <AmbientSettingsCard defaultAccent="#38bdf8" appName="CAPost" />
  {:else if activeTab === 'updates'}
    <div class="{CARD} space-y-4">
      <div class="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 class="text-lg font-semibold text-neutral-900 dark:text-white">{t('settings.updates.title')}</h2>
          <p class="{MUTED} text-sm">{t('settings.updates.current')} <span class="font-mono text-sky-600 dark:text-sky-400">v{APP_VERSION}</span></p>
        </div>
        {#if updater.status === 'available'}
          <button
            onclick={installUpdate}
            class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-md transition-colors shadow-sm">
            {t('settings.updates.install')}
          </button>
        {:else}
          <button
            onclick={() => checkForUpdates()}
            disabled={updater.status === 'checking' || updater.status === 'downloading'}
            class="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white text-sm font-medium rounded-md transition-colors flex items-center gap-2 shadow-sm">
            {#if updater.status === 'checking'}
              <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
              {t('settings.updates.checking')}
            {:else}
              {t('settings.updates.check')}
            {/if}
          </button>
        {/if}
      </div>

      {#if updater.status === 'up-to-date'}
        <div class="flex items-center gap-2 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-sm">
          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
          {t('settings.updates.latest', { version: APP_VERSION })}
        </div>
      {:else if updater.status === 'available'}
        <div class="p-3 rounded-md bg-sky-500/10 border border-sky-500/30 text-sky-700 dark:text-sky-300 text-sm">
          {t('settings.updates.available', { version: updater.version })}
          <a href={releaseNotesUrl(updater.version)} class="underline underline-offset-2 hover:text-sky-900 dark:hover:text-white">{t('settings.updates.readChangelog')}</a>
        </div>
      {:else if updater.status === 'downloading'}
        <div class="p-3 rounded-md bg-sky-500/10 border border-sky-500/30 text-sky-700 dark:text-sky-300 text-sm">
          {t('settings.updates.downloading', { version: updater.version, progress: downloadPercent === null ? '...' : ` (${downloadPercent}%)` })}
        </div>
      {:else if updater.status === 'error'}
        <div class="p-3 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-sm">
          {updater.error}
        </div>
      {/if}
    </div>
  {:else if activeTab === 'ai'}
    <div class="{CARD} space-y-4">
      <div>
        <h2 class="text-lg font-semibold text-neutral-900 dark:text-white">{t('settings.ai.title')}</h2>
        <p class="{MUTED} text-sm">{t('settings.ai.subtitle')}</p>
      </div>

      {#if !$isPro}
        <div class="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div class="flex-1 space-y-1 text-xs text-amber-700 dark:text-amber-400">
            <span class="font-bold block text-sm">★ CAPost PRO Diperlukan untuk Fitur AI</span>
            <p class="leading-relaxed">
              Fitur AI memerlukan lisensi CAPost PRO. Pro member dapat menggunakan API Key sendiri
              (BYOK - OpenAI, Claude, Gemini, DeepSeek, Ollama) tanpa batas.
            </p>
          </div>
          <button
            type="button"
            onclick={() =>
              proGate.open(
                'Pengaturan AI &amp; BYOK',
                'Fitur AI memerlukan lisensi CAPost PRO. Pro member dapat menggunakan API Key sendiri (BYOK - OpenAI, Claude, Gemini, DeepSeek, Ollama) tanpa batas.'
              )}
            class="px-4 py-2 rounded-lg text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 transition-colors cursor-pointer shrink-0 shadow-sm"
          >
            Upgrade ke PRO
          </button>
        </div>
      {:else}
        <AiSettingsForm />
      {/if}
    </div>
  {:else if activeTab === 'pro'}
    <!-- Current plan -->
    <div class="{CARD} !p-0 overflow-hidden">
      <div class="flex flex-col md:flex-row md:items-center gap-5 p-6 {$isPro ? 'bg-gradient-to-r from-brand-500/[0.08] via-transparent to-transparent' : ''}">
        <div class="w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center text-2xl {$isPro ? 'bg-brand-500/15 text-brand-500 ring-1 ring-brand-500/30' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400'}">★</div>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-lg font-semibold text-neutral-900 dark:text-white">CAPost {planLabel}</h2>
            {#if $isPro}
              <span class="cp-pill font-sans bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">✓ {t('settings.license.statusActive')}</span>
            {/if}
          </div>
          <p class="{MUTED} text-sm mt-0.5">{planBody}</p>
          {#if $licenseInfo.licenseKeyMasked && $isPro && !isTrial}
            <p class="mt-2 text-[12px] {MUTED}">
              {t('settings.license.activeKey')}: <span class="font-mono tracking-wider text-neutral-800 dark:text-neutral-200">{$licenseInfo.licenseKeyMasked}</span>
            </p>
          {/if}
        </div>
        {#if $isPro && !isTrial}
          <button type="button" class="cp-btn cp-btn-danger shrink-0" onclick={deactivateLicense}>{t('settings.license.deactivate')}</button>
        {/if}
      </div>
      {#if isTrial}
        <div class="h-1 bg-neutral-100 dark:bg-white/[0.05]"><div class="h-full bg-brand-500" style="width:{Math.max(4, (trialDaysLeft / 7) * 100)}%"></div></div>
      {/if}
    </div>

    {#if !$isPro || isTrial}
      <div class="grid gap-6 {!$isPro && !$licenseInfo.trialUsed ? 'lg:grid-cols-[1fr_320px]' : ''}">
        <div class={CARD}>
          <LicenseActivation />
        </div>
        {#if !$isPro && !$licenseInfo.trialUsed}
          <div class="{CARD} flex flex-col">
            <h3 class="text-[14px] font-semibold text-neutral-900 dark:text-white">{t('settings.license.trialTitle')}</h3>
            <p class="mt-0.5 cp-muted flex-1">{t('settings.license.trialBody')}</p>
            <button type="button" class="cp-btn mt-4 justify-center" onclick={startTrial} disabled={trialBusy}>✨ {t('settings.license.trialStart')}</button>
          </div>
        {/if}
      </div>
      {#if !$isPro && $licenseInfo.trialUsed}
        <p class="text-[12px] {MUTED} -mt-2">{t('settings.license.trialUsed')}</p>
      {/if}
    {/if}

    <!-- What Pro adds -->
    <div class="{CARD} !p-0 overflow-hidden">
      <div class="px-6 pt-5 pb-3">
        <h3 class="text-[14px] font-semibold text-neutral-900 dark:text-white">{t('settings.license.compareTitle')}</h3>
      </div>
      <table class="cp-table">
        <thead>
          <tr>
            <th class="!pl-6">{t('settings.license.feature')}</th>
            <th class="w-36 text-center">{t('settings.license.free')}</th>
            <th class="w-36 text-center !pr-6">{t('settings.license.pro')}</th>
          </tr>
        </thead>
        <tbody>
          {#each compareRows as row (row.label)}
            <tr>
              <td class="!pl-6 text-neutral-800 dark:text-neutral-200">{row.label}</td>
              <td class="text-center {row.free === '—' ? 'text-neutral-400' : 'text-neutral-700 dark:text-neutral-300'}">{row.free}</td>
              <td class="text-center !pr-6 font-medium text-brand-600 dark:text-brand-400">{row.pro}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else if activeTab === 'security'}
    <div class="{CARD} space-y-4">
      <h2 class="text-lg font-semibold text-neutral-900 dark:text-white">{t('settings.security.title')}</h2>
      <p class="{MUTED} text-sm">{t('settings.security.subtitle')}</p>

      <form onsubmit={handleChangeMasterPassword} class="max-w-md space-y-4 pt-2">
        <p class="text-xs {MUTED}">{t('settings.security.rekeyNote')}</p>
        <div>
          <label for="current-pass" class={LABEL}>{t('settings.security.current')}</label>
          <input
            id="current-pass"
            type={showPasswords ? 'text' : 'password'}
            required
            autocomplete="current-password"
            bind:value={currentPassword}
            class={INPUT} />
        </div>
        <div>
          <label for="new-pass" class={LABEL}>{t('settings.security.new', { min: MIN_VAULT_PASSWORD_LEN })}</label>
          <input
            id="new-pass"
            type={showPasswords ? 'text' : 'password'}
            required
            minlength={MIN_VAULT_PASSWORD_LEN}
            autocomplete="new-password"
            bind:value={newPassword}
            class={INPUT} />
        </div>
        <div>
          <label for="confirm-pass" class={LABEL}>{t('settings.security.confirm')}</label>
          <input
            id="confirm-pass"
            type={showPasswords ? 'text' : 'password'}
            required
            minlength={MIN_VAULT_PASSWORD_LEN}
            autocomplete="new-password"
            bind:value={confirmPassword}
            class={INPUT} />
        </div>
        <label class="flex items-center gap-2 text-xs {MUTED}">
          <input type="checkbox" bind:checked={showPasswords} class="rounded" />
          {t('settings.security.showPasswords')}
        </label>
        <button
          type="submit"
          disabled={isChangingPassword}
          class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-medium rounded-md transition-colors">
          {isChangingPassword ? t('settings.security.reencrypting') : t('settings.security.change')}
        </button>
      </form>

      <!-- Audit Trail Settings -->
      <div class="border-t border-neutral-200 dark:border-neutral-800 pt-6 space-y-3">
        <div>
          <h3 class="text-base font-semibold text-neutral-900 dark:text-white">{t('settings.audit.title')}</h3>
          <p class="{MUTED} text-xs mt-1">{t('settings.audit.body')}</p>
        </div>
        <form onsubmit={handleSaveAuditSettings} class="flex items-end gap-4 max-w-sm">
          <div class="flex-1">
            <label for="max-audit" class={LABEL}>{t('settings.audit.maxRecords')}</label>
            <input
              id="max-audit"
              type="number"
              min="100"
              max="50000"
              step="100"
              bind:value={maxAuditRecords}
              class={INPUT}
            />
          </div>
          <button
            type="submit"
            class="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-md transition-colors whitespace-nowrap"
          >
            {t('common.save')}
          </button>
        </form>
      </div>
    </div>
  {:else if activeTab === 'backup'}
    <div class="{CARD} space-y-8">
      <div>
        <h2 class="text-lg font-semibold text-neutral-900 dark:text-white">{t('settings.backup.title')}</h2>
        <p class="{MUTED} text-sm mt-1">{t('settings.backup.subtitle')}</p>
      </div>

      <div class="space-y-4">
        <h3 class="text-base font-semibold text-neutral-900 dark:text-white">{t('settings.backup.exportTitle')}</h3>
        <p class="text-xs {MUTED}">{t('settings.backup.exportBody')}</p>
        <form onsubmit={handleExport} class="max-w-md space-y-4 pt-2">
          <div>
            <label for="backup-pass" class={LABEL}>{t('settings.backup.exportPassphrase')}</label>
            <div class="relative">
              <input
                id="backup-pass"
                type={showBackupPassphrase ? 'text' : 'password'}
                minlength="8"
                required
                bind:value={backupPassphrase}
                class="{INPUT} pr-10" />
              <button
                type="button"
                onclick={() => (showBackupPassphrase = !showBackupPassphrase)}
                class={EYE_BUTTON}
                aria-label={showBackupPassphrase ? t('settings.backup.hidePassphrase') : t('settings.backup.showPassphrase')}
                title={showBackupPassphrase ? t('settings.backup.hidePassphrase') : t('settings.backup.showPassphrase')}
              >
                {#if showBackupPassphrase}
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                {:else}
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                {/if}
              </button>
            </div>
          </div>
          {#if backupMsg}
            <p class="text-xs {backupMsgKind === 'success' ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-600 dark:text-red-500'}">{backupMsg}</p>
          {/if}
          <button type="submit" class="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-md transition-colors">
            {t('settings.backup.exportButton')}
          </button>
        </form>
      </div>

      <hr class="border-neutral-200 dark:border-neutral-800" />

      <div class="space-y-4">
        <h3 class="text-base font-semibold text-neutral-900 dark:text-white">{t('settings.backup.restoreTitle')}</h3>
        <p class="text-xs {MUTED}">{t('settings.backup.restoreBody')}</p>
        <form onsubmit={handleImport} class="max-w-md space-y-4 pt-2">
          <div>
            <label for="restore-pass" class={LABEL}>{t('settings.backup.restorePassphrase')}</label>
            <div class="relative">
              <input
                id="restore-pass"
                type={showRestorePassphrase ? 'text' : 'password'}
                required
                bind:value={restorePassphrase}
                class="{INPUT} pr-10" />
              <button
                type="button"
                onclick={() => (showRestorePassphrase = !showRestorePassphrase)}
                class={EYE_BUTTON}
                aria-label={showRestorePassphrase ? t('settings.backup.hidePassphrase') : t('settings.backup.showPassphrase')}
                title={showRestorePassphrase ? t('settings.backup.hidePassphrase') : t('settings.backup.showPassphrase')}
              >
                {#if showRestorePassphrase}
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                {:else}
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                {/if}
              </button>
            </div>
          </div>
          {#if restoreMsg}
            <p class="text-xs {restoreMsgKind === 'success' ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-600 dark:text-red-500'}">{restoreMsg}</p>
          {/if}
          <button type="submit" class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-md transition-colors">
            {t('settings.backup.restoreButton')}
          </button>
        </form>
      </div>
    </div>
	{:else if activeTab === 'performance'}
		<div class="{CARD} space-y-6">
			<div>
				<h2 class="text-lg font-semibold text-neutral-900 dark:text-white">{t('settings.performance.title')}</h2>
				<p class="{MUTED} text-sm mt-1">{t('settings.performance.subtitle')}</p>
			</div>

			<!-- 1. Background Memory Saving (Toggleable, On by default) -->
			<div class="{SUBCARD} flex items-start justify-between gap-4">
				<div class="min-w-0">
					<p class="text-sm font-medium text-neutral-900 dark:text-white">{t('settings.performance.backgroundTitle')}</p>
					<p class="text-xs {MUTED} mt-1 leading-relaxed">{t('settings.performance.backgroundBody')}</p>
					<p class="text-[11px] text-neutral-500 mt-2">{t('settings.performance.recommended')}</p>
				</div>
				<button
					type="button"
					role="switch"
					aria-checked={backgroundMemorySaving}
					aria-label={t('settings.performance.backgroundTitle')}
					disabled={isSavingPerformance}
					onclick={() => saveAllPerformancePrefs({ backgroundMemorySaving: !backgroundMemorySaving })}
					class="relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 {backgroundMemorySaving ? 'bg-sky-600' : 'bg-neutral-300 dark:bg-neutral-700'} cursor-pointer"
				>
					<span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform {backgroundMemorySaving ? 'translate-x-5' : ''}"></span>
				</button>
			</div>

			<!-- 2. GPU Acceleration (Off by default) -->
			<div class="{SUBCARD} flex items-start justify-between gap-4">
				<div class="min-w-0">
					<p class="text-sm font-medium text-neutral-900 dark:text-white">{t('settings.performance.gpuTitle')}</p>
					<p class="text-xs {MUTED} mt-1 leading-relaxed">{t('settings.performance.gpuBody')}</p>
					<p class="text-[11px] text-neutral-500 mt-2">{t('settings.performance.recommendedGpuOff')} · {t('settings.performance.restartNote')}</p>
				</div>
				<button
					type="button"
					role="switch"
					aria-checked={gpuAcceleration}
					aria-label={t('settings.performance.gpuTitle')}
					disabled={isSavingPerformance}
					onclick={() => saveAllPerformancePrefs({ gpuAcceleration: !gpuAcceleration }, true)}
					class="relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 {gpuAcceleration ? 'bg-sky-600' : 'bg-neutral-300 dark:bg-neutral-700'} cursor-pointer"
				>
					<span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform {gpuAcceleration ? 'translate-x-5' : ''}"></span>
				</button>
			</div>

			<!-- 3. Terminal Scrollback Buffer Limit -->
			<div class="{SUBCARD} flex items-start justify-between gap-4">
				<div class="min-w-0">
					<p class="text-sm font-medium text-neutral-900 dark:text-white">{t('settings.performance.scrollbackTitle')}</p>
					<p class="text-xs {MUTED} mt-1 leading-relaxed">{t('settings.performance.scrollbackBody')}</p>
				</div>
				<select
					value={scrollbackLines}
					disabled={isSavingPerformance}
					onchange={(e) => saveAllPerformancePrefs({ scrollbackLines: parseInt(e.currentTarget.value, 10) })}
					class="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-900 dark:text-white focus:outline-none focus:border-sky-500 shrink-0 cursor-pointer"
				>
					<option value={1000}>{t('settings.performance.scrollback1k')}</option>
					<option value={5000}>{t('settings.performance.scrollback5k')}</option>
					<option value={10000}>{t('settings.performance.scrollback10k')}</option>
					<option value={50000}>{t('settings.performance.scrollback50k')}</option>
				</select>
			</div>

			<!-- 4. Inactive Tab Sleep / Power Saver -->
			<div class="{SUBCARD} flex items-start justify-between gap-4">
				<div class="min-w-0">
					<p class="text-sm font-medium text-neutral-900 dark:text-white">{t('settings.performance.sleepTitle')}</p>
					<p class="text-xs {MUTED} mt-1 leading-relaxed">{t('settings.performance.sleepBody')}</p>
					<p class="text-[11px] text-neutral-500 mt-2">{t('settings.performance.recommended')}</p>
				</div>
				<button
					type="button"
					role="switch"
					aria-checked={inactiveSessionSleep}
					aria-label={t('settings.performance.sleepTitle')}
					disabled={isSavingPerformance}
					onclick={() => saveAllPerformancePrefs({ inactiveSessionSleep: !inactiveSessionSleep })}
					class="relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 {inactiveSessionSleep ? 'bg-sky-600' : 'bg-neutral-300 dark:bg-neutral-700'} cursor-pointer"
				>
					<span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform {inactiveSessionSleep ? 'translate-x-5' : ''}"></span>
				</button>
			</div>

			<!-- 5. Low-Power Mode (30 FPS Limiter) -->
			<div class="{SUBCARD} flex items-start justify-between gap-4">
				<div class="min-w-0">
					<p class="text-sm font-medium text-neutral-900 dark:text-white">{t('settings.performance.lowPowerTitle')}</p>
					<p class="text-xs {MUTED} mt-1 leading-relaxed">{t('settings.performance.lowPowerBody')}</p>
				</div>
				<button
					type="button"
					role="switch"
					aria-checked={lowPowerMode}
					aria-label={t('settings.performance.lowPowerTitle')}
					disabled={isSavingPerformance}
					onclick={() => saveAllPerformancePrefs({ lowPowerMode: !lowPowerMode })}
					class="relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 {lowPowerMode ? 'bg-sky-600' : 'bg-neutral-300 dark:bg-neutral-700'} cursor-pointer"
				>
					<span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform {lowPowerMode ? 'translate-x-5' : ''}"></span>
				</button>
			</div>

			<!-- 6. Lock Screen Animation (On by default) -->
			<div class="{SUBCARD} flex items-start justify-between gap-4">
				<div class="min-w-0">
					<p class="text-sm font-medium text-neutral-900 dark:text-white">{t('settings.performance.lockAnimationTitle')}</p>
					<p class="text-xs {MUTED} mt-1 leading-relaxed">{t('settings.performance.lockAnimationBody')}</p>
				</div>
				<button
					type="button"
					role="switch"
					aria-checked={!appearance.reduceMotion}
					aria-label={t('settings.performance.lockAnimationTitle')}
					onclick={() => setReduceMotion(!appearance.reduceMotion)}
					class="relative shrink-0 w-11 h-6 rounded-full transition-colors {!appearance.reduceMotion ? 'bg-sky-600' : 'bg-neutral-300 dark:bg-neutral-700'} cursor-pointer"
				>
					<span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform {!appearance.reduceMotion ? 'translate-x-5' : ''}"></span>
				</button>
			</div>
		</div>
  {:else if activeTab === 'shortcuts'}
    <div class="{CARD} space-y-6">
      <div>
        <h2 class="text-lg font-semibold text-neutral-900 dark:text-white">{t('settings.shortcuts.title')}</h2>
        <p class="{MUTED} text-sm mt-1">{t('settings.shortcuts.subtitle')}</p>
      </div>

      <div class="space-y-4">
        {#each SHORTCUT_GROUPS as group, gi (group.title)}
          <h3 class="text-sm font-semibold text-neutral-600 dark:text-neutral-300 uppercase tracking-wider {gi > 0 ? 'pt-2' : ''}">{t(`settings.shortcuts.${group.title}`)}</h3>
          <div class="space-y-2">
            {#each group.items as item (item.label)}
              <div class="flex justify-between items-center gap-3 p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md">
                <span class="text-sm text-neutral-800 dark:text-neutral-200">{t(`settings.shortcuts.${item.label}`, item.vars)}</span>
                <span class="flex flex-wrap justify-end items-center gap-1.5 text-xs text-neutral-500">
                  {#each item.keys as combo, ci (ci)}
                    {#if ci > 0}<span>{t('settings.shortcuts.or')}</span>{/if}
                    <kbd class="px-2 py-1 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs rounded font-mono whitespace-nowrap">{combo.join(' + ')}</kbd>
                  {/each}
                </span>
              </div>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  {/if}
  </div>
  </div>
  </div>
</div>
