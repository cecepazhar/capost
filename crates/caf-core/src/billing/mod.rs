pub mod client;
pub mod gate;
pub mod state;
pub mod store;
pub mod token;

use crate::error::CafError;
use state::{EffectiveState, EffectiveTier};

/// Product code inside a CAPost key: `CAPS99-XXXXXX-C`.
const LICENSE_PRODUCT: &str = "PS";

fn is_capost_key(key: &str) -> bool {
    key.trim().to_uppercase().strip_prefix("CA").is_some_and(|rest| rest.starts_with(LICENSE_PRODUCT))
}

/// Fetch the current effective billing state (License, Trial, GCC Token, or Free).
pub fn get_effective_state() -> Result<EffectiveState, CafError> {
    let now_unix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // 1. Check if a license key is activated
    //    A key of another product stored by an older version no longer counts.
    if let Some((key, tier, billing_type)) = store::get_license_info()? {
        if tier == "pro" && is_capost_key(&key) {
            return Ok(EffectiveState {
                tier: EffectiveTier::Pro,
                billing_type,
                is_pro: true,
                expires_at: None,
                grace_until: None,
                warning: None,
            });
        }
    }

    // 2. Check if a trial is active
    if let Some((_started, expires_at)) = store::get_trial_info()? {
        if now_unix <= expires_at {
            let expires_dt = chrono::DateTime::from_timestamp(expires_at as i64, 0)
                .map(|dt| dt.to_rfc3339());
            return Ok(EffectiveState {
                tier: EffectiveTier::Pro,
                billing_type: "trial".to_string(),
                is_pro: true,
                expires_at: expires_dt,
                grace_until: None,
                warning: None,
            });
        }
    }

    // 3. Check if cached JWT token exists and verify it
    let cached_token = store::get_cached_token()?;
    let last_verified_at = store::get_last_verified_at()?;
    let max_seen_time = store::get_max_seen_time()?;

    if let Some(ref tok) = cached_token {
        let device_id = store::get_device_id()?.unwrap_or_else(|| "default_dev".to_string());
        let keys = vec![(
            "gcc-2026-10".to_string(),
            "Su0nese5LuWHeNPFIz69p0HGUsdT49rnEn82fbtY2S8=".to_string(),
        )];
        let token_payload = token::verify_and_parse_token(tok, &keys, "CAPOST", &device_id).ok();
        let effective = state::compute_effective_state(
            token_payload.as_ref(),
            last_verified_at,
            max_seen_time,
            now_unix,
        );
        if effective.is_pro {
            return Ok(effective);
        }
    }

    // 4. Default: Free tier
    Ok(EffectiveState {
        tier: EffectiveTier::Free,
        billing_type: "free".to_string(),
        is_pro: false,
        expires_at: None,
        grace_until: None,
        warning: None,
    })
}

/// Instant 7-day Pro trial activation — once per installation. Starting it again while it is
/// running is a no-op; after it has ended it is refused (deactivating a licence keeps the
/// trial markers, see [`sign_out`], so the trial cannot be reset that way either).
pub fn start_trial() -> Result<EffectiveState, CafError> {
    let now_unix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    if let Some((_started, expires_at)) = store::get_trial_info()? {
        if now_unix <= expires_at {
            return get_effective_state();
        }
        return Err(CafError::generic(
            "The CAPost Pro trial has already been used on this device. Activate a licence key to keep using Pro.",
        ));
    }
    let trial_duration_secs = 7 * 86400; // 7 days
    let expires_at_unix = now_unix + trial_duration_secs;
    store::save_trial_info(now_unix, expires_at_unix)?;
    get_effective_state()
}

/// Activate a license key (e.g. Creem, Founder, or offline key)
pub fn activate_license(license_key: &str) -> Result<EffectiveState, CafError> {
    let clean_key = license_key.trim();
    if clean_key.is_empty() {
        return Err(CafError::Validation(crate::error::ValidationError::EmptyField));
    }
    let upper = clean_key.to_uppercase();
    // New license format: CA[PRODUCT][TIER]-[RAND6]-[CK] (e.g., CATB99-A1B2C3-7)
    let parts: Vec<&str> = upper.split('-').collect();
    if parts.len() != 3 {
        return Err(CafError::Validation(crate::error::ValidationError::InvalidFormat));
    }
    let prefix_tier = parts[0];
    let rand_part = parts[1];
    let ck_str = parts[2];
    if prefix_tier.len() != 6 { return Err(CafError::Validation(crate::error::ValidationError::InvalidFormat)); }
    if rand_part.len() != 6 { return Err(CafError::Validation(crate::error::ValidationError::InvalidFormat)); }
    if ck_str.len() != 1 { return Err(CafError::Validation(crate::error::ValidationError::InvalidFormat)); }
    if !prefix_tier.starts_with("CA") { return Err(CafError::Validation(crate::error::ValidationError::InvalidFormat)); }
    let product = &prefix_tier[2..4];
    let tier = &prefix_tier[4..6];
    // Only CAPost keys: licences of other CA products must not unlock CAPost.
    if product != LICENSE_PRODUCT { return Err(CafError::Validation(crate::error::ValidationError::InvalidFormat)); }
    if tier.parse::<u8>().is_err() { return Err(CafError::Validation(crate::error::ValidationError::InvalidFormat)); }
    if !rand_part.chars().all(|c| c.is_ascii_alphanumeric()) { return Err(CafError::Validation(crate::error::ValidationError::InvalidFormat)); }
    // Compute checksum (mod‑10)
    let mut sum: u32 = 0;
    for ch in upper[..upper.len()-2].chars() {
        let val = if ch.is_ascii_digit() {
            (ch as u8 - b'0') as u32
        } else if ch.is_ascii_uppercase() {
            (ch as u8 - b'A' + 10) as u32
        } else {
            0
        };
        sum += val;
    }
    let expected_ck = ((10 - (sum % 10)) % 10) as u8;
    let provided_ck = ck_str.parse::<u8>().map_err(|_| CafError::Validation(crate::error::ValidationError::InvalidFormat))?;
    if expected_ck != provided_ck { return Err(CafError::Validation(crate::error::ValidationError::InvalidFormat)); }
    let is_lifetime = tier == "99";
    let billing_type = if is_lifetime { "lifetime" } else { "yearly" };
    store::save_license_info(clean_key, "pro", billing_type)?;
    get_effective_state()
}

/// Deactivate the licence on this device / sign out of the Pro token. The trial markers stay,
/// so the 7-day trial cannot be restarted by deactivating.
pub fn sign_out() -> Result<(), CafError> {
    store::clear_license_and_tokens()
}

/// What the Settings → CAPost Pro screen needs beyond the entitlement itself.
#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LicenseInfo {
    /// The 7-day trial has been started at some point on this installation.
    pub trial_used: bool,
    /// The activated key with its middle part hidden (`CAPS99-••••••-3`), if any.
    pub license_key_masked: Option<String>,
}

pub fn license_info() -> Result<LicenseInfo, CafError> {
    let license_key_masked = store::get_license_info()?.map(|(key, _, _)| mask_license_key(&key));
    Ok(LicenseInfo {
        trial_used: store::get_trial_started_at()?.is_some(),
        license_key_masked,
    })
}

fn mask_license_key(key: &str) -> String {
    let parts: Vec<&str> = key.trim().split('-').collect();
    match parts.as_slice() {
        [head, mid, tail] => format!("{}-{}-{}", head.to_uppercase(), "•".repeat(mid.chars().count()), tail),
        _ => "•".repeat(key.chars().count().min(16)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_start_trial_activates_pro_state() {
        let _iso = crate::test_support::isolated_data_dir("billing_trial");
        store::clear_billing_state().unwrap();

        // Should be Free first
        let state = get_effective_state().unwrap();
        assert!(!state.is_pro);
        assert_eq!(state.tier, EffectiveTier::Free);

        // Start a trial
        let state = start_trial().unwrap();
        assert!(state.is_pro);
        assert_eq!(state.tier, EffectiveTier::Pro);
        assert_eq!(state.billing_type, "trial");
        assert!(state.expires_at.is_some());

        // Starting it again while it runs changes nothing.
        let again = start_trial().unwrap();
        assert_eq!(again.billing_type, "trial");

        // Deactivating a licence keeps the trial (it is once per installation).
        sign_out().unwrap();
        assert!(get_effective_state().unwrap().is_pro);
        assert!(license_info().unwrap().trial_used);

        // Once expired, the trial cannot be restarted.
        store::save_trial_info(1, 2).unwrap();
        assert!(!get_effective_state().unwrap().is_pro);
        assert!(start_trial().is_err());
    }

    #[test]
    fn test_license_info_masks_key() {
        assert_eq!(mask_license_key("caps99-a1b2c3-7"), "CAPS99-••••••-7");
    }

    #[test]
    fn test_activate_license_validates_and_stores() {
        let _iso = crate::test_support::isolated_data_dir("billing_license");
        store::clear_billing_state().unwrap();

        // Empty key should fail
        assert!(activate_license("").is_err());
        assert!(activate_license("short").is_err());

        // Old/invalid formats and a wrong check digit are refused.
        assert!(activate_license("CAPOST-PRO-ABCD-1234").is_err());
        assert!(activate_license("CAPS01-A1B2C3-4").is_err());

        // Valid yearly key (tier 01); case does not matter.
        let state = activate_license("caps01-a1b2c3-5").unwrap();
        assert!(state.is_pro);
        assert_eq!(state.billing_type, "yearly");
        assert_eq!(license_info().unwrap().license_key_masked.as_deref(), Some("CAPS01-••••••-5"));

        // A well-formed key of another product (valid check digit) is refused.
        assert!(activate_license("CATM99-R64108-3").is_err());

        // ...and one already stored by an older version stops counting.
        store::save_license_info("CATM99-R64108-3", "pro", "lifetime").unwrap();
        assert!(!get_effective_state().unwrap().is_pro);

        // Tier 99 is lifetime.
        let state = activate_license("CAPS99-A1B2C3-8").unwrap();
        assert_eq!(state.billing_type, "lifetime");

        sign_out().unwrap();
        let state = get_effective_state().unwrap();
        assert!(!state.is_pro);
    }
}
