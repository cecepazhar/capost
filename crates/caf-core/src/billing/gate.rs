//! Feature-level Pro access guards.

use super::state::{EffectiveState, EffectiveTier, compute_effective_state};
use super::store;
use super::token::verify_and_parse_token;
use crate::error::{CafError, ProError};

/// Checks if the current cached billing state grants access to a Pro feature.
/// Returns Ok(EffectiveState) if Pro or ProGrace, otherwise returns Err(ProError::FeatureLocked).
pub fn require_pro(
    public_keys: &[(String, String)],
    product_code: &str,
    now_unix: u64,
) -> Result<EffectiveState, CafError> {
    // 1. License key check
    if let Some((_key, tier, billing_type)) = store::get_license_info()? {
        if tier == "pro" {
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

    // 2. Trial check
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

    let device_id = store::get_device_id()?.unwrap_or_else(|| "default_dev".to_string());
    let cached_token = store::get_cached_token()?;
    let last_verified_at = store::get_last_verified_at()?;
    let max_seen_time = store::get_max_seen_time()?;

    let token_payload = if let Some(ref tok) = cached_token {
        verify_and_parse_token(tok, public_keys, product_code, &device_id).ok()
    } else {
        None
    };

    let effective = compute_effective_state(
        token_payload.as_ref(),
        last_verified_at,
        max_seen_time,
        now_unix,
    );

    if effective.is_pro
        && (effective.tier == EffectiveTier::Pro || effective.tier == EffectiveTier::ProGrace)
    {
        Ok(effective)
    } else {
        Err(CafError::Pro(ProError::FeatureLocked))
    }
}
