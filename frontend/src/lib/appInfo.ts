// Single source of truth for version string prints. Was hardcoded in four places
// and drifted (sidebar said v2.1.7 while build was 2.1.8). package.json bumped in
// lockstep with Cargo workspace / tauri.conf.json on release.
import { version } from '../../package.json';

export const APP_VERSION: string = version;
export const APP_NAME = 'CAPost';
export const REPO_URL = 'https://github.com/cecepazhar/capost';
export const WEBSITE_URL = 'https://capost.fathforce.com';
export const AUTHOR_URL = 'https://cecepazhar.com';
export const PRICING_URL = 'https://creem.io/checkout/fathforce-sovereign-lifetime';
export const GITHUB_SPONSORS_URL = 'https://github.com/sponsors/cecepazhar';

/**
 * Pricing / Creem checkout page for the signed-in CAPost account: passes the account id on to
 * Creem as checkout custom data, so the subscription lands on this account whatever email
 * is typed at checkout. Only the opaque account id travels, never the email.
 */
export function pricingUrl(accountId?: string | null): string {
  if (!accountId || !/^[0-9a-f-]{36}$/i.test(accountId)) return PRICING_URL;
  return `${PRICING_URL}?account=${accountId}`;
}

export function releaseNotesUrl(ver: string): string {
  return `${REPO_URL}/releases/tag/v${ver.replace(/^v/, '')}`;
}
