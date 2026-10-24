//! Secure SQLCipher storage for billing tokens and device state.

use crate::db;
use crate::error::{CafError, DbError};

const KEY_DEVICE_TOKEN: &str = "billing.device_token";
const KEY_DEVICE_ID: &str = "billing.device_id";
const KEY_CACHED_TOKEN: &str = "billing.cached_token";
const KEY_LAST_VERIFIED_AT: &str = "billing.last_verified_at";
const KEY_MAX_SEEN_TIME: &str = "billing.max_seen_time";
const KEY_TRIAL_STARTED_AT: &str = "billing.trial_started_at";
const KEY_TRIAL_EXPIRES_AT: &str = "billing.trial_expires_at";
const KEY_LICENSE_KEY: &str = "billing.license_key";
const KEY_LICENSE_TIER: &str = "billing.license_tier";
const KEY_LICENSE_BILLING_TYPE: &str = "billing.license_billing_type";

pub fn save_device_info(device_id: &str, device_token: &str) -> Result<(), CafError> {
    let conn = db::open()?;
    conn.execute(
        "INSERT OR REPLACE INTO app_kv (key, value) VALUES (?1, ?2), (?3, ?4)",
        [KEY_DEVICE_ID, device_id, KEY_DEVICE_TOKEN, device_token],
    )
    .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;
    Ok(())
}

pub fn get_device_id() -> Result<Option<String>, CafError> {
    get_kv(KEY_DEVICE_ID)
}

pub fn get_device_token() -> Result<Option<String>, CafError> {
    get_kv(KEY_DEVICE_TOKEN)
}

pub fn save_cached_token(token: &str, verified_at_unix: u64) -> Result<(), CafError> {
    let conn = db::open()?;
    let time_str = verified_at_unix.to_string();

    // Update max seen time as well
    let current_max = get_max_seen_time()?.unwrap_or(0);
    let new_max = current_max.max(verified_at_unix).to_string();

    conn.execute(
        "INSERT OR REPLACE INTO app_kv (key, value) VALUES (?1, ?2), (?3, ?4), (?5, ?6)",
        [
            KEY_CACHED_TOKEN,
            token,
            KEY_LAST_VERIFIED_AT,
            &time_str,
            KEY_MAX_SEEN_TIME,
            &new_max,
        ],
    )
    .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;
    Ok(())
}

pub fn get_cached_token() -> Result<Option<String>, CafError> {
    get_kv(KEY_CACHED_TOKEN)
}

pub fn get_last_verified_at() -> Result<Option<u64>, CafError> {
    if let Some(s) = get_kv(KEY_LAST_VERIFIED_AT)? {
        Ok(s.parse::<u64>().ok())
    } else {
        Ok(None)
    }
}

pub fn get_max_seen_time() -> Result<Option<u64>, CafError> {
    if let Some(s) = get_kv(KEY_MAX_SEEN_TIME)? {
        Ok(s.parse::<u64>().ok())
    } else {
        Ok(None)
    }
}

pub fn update_max_seen_time(now_unix: u64) -> Result<(), CafError> {
    let current_max = get_max_seen_time()?.unwrap_or(0);
    if now_unix > current_max {
        let conn = db::open()?;
        conn.execute(
            "INSERT OR REPLACE INTO app_kv (key, value) VALUES (?1, ?2)",
            [KEY_MAX_SEEN_TIME, &now_unix.to_string()],
        )
        .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;
    }
    Ok(())
}

pub fn save_trial_info(started_at_unix: u64, expires_at_unix: u64) -> Result<(), CafError> {
    let conn = db::open()?;
    conn.execute(
        "INSERT OR REPLACE INTO app_kv (key, value) VALUES (?1, ?2), (?3, ?4)",
        [
            KEY_TRIAL_STARTED_AT,
            &started_at_unix.to_string(),
            KEY_TRIAL_EXPIRES_AT,
            &expires_at_unix.to_string(),
        ],
    )
    .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;
    Ok(())
}

pub fn get_trial_info() -> Result<Option<(u64, u64)>, CafError> {
    let started = get_trial_started_at()?;
    let expires = if let Some(s) = get_kv(KEY_TRIAL_EXPIRES_AT)? {
        s.parse::<u64>().ok()
    } else {
        None
    };

    if let (Some(s), Some(e)) = (started, expires) {
        Ok(Some((s, e)))
    } else {
        Ok(None)
    }
}

pub fn get_trial_started_at() -> Result<Option<u64>, CafError> {
    if let Some(s) = get_kv(KEY_TRIAL_STARTED_AT)? {
        Ok(s.parse::<u64>().ok())
    } else {
        Ok(None)
    }
}

pub fn save_license_info(license_key: &str, tier: &str, billing_type: &str) -> Result<(), CafError> {
    let conn = db::open()?;
    conn.execute(
        "INSERT OR REPLACE INTO app_kv (key, value) VALUES (?1, ?2), (?3, ?4), (?5, ?6)",
        [
            KEY_LICENSE_KEY,
            license_key,
            KEY_LICENSE_TIER,
            tier,
            KEY_LICENSE_BILLING_TYPE,
            billing_type,
        ],
    )
    .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;
    Ok(())
}

pub fn get_license_info() -> Result<Option<(String, String, String)>, CafError> {
    let key = get_kv(KEY_LICENSE_KEY)?;
    let tier = get_kv(KEY_LICENSE_TIER)?.unwrap_or_else(|| "pro".to_string());
    let billing_type = get_kv(KEY_LICENSE_BILLING_TYPE)?.unwrap_or_else(|| "yearly".to_string());

    if let Some(k) = key {
        if !k.trim().is_empty() {
            return Ok(Some((k, tier, billing_type)));
        }
    }
    Ok(None)
}

pub fn clear_billing_state() -> Result<(), CafError> {
    let conn = db::open()?;
    conn.execute(
        "DELETE FROM app_kv WHERE key IN (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        [
            KEY_DEVICE_TOKEN,
            KEY_CACHED_TOKEN,
            KEY_LAST_VERIFIED_AT,
            KEY_MAX_SEEN_TIME,
            KEY_TRIAL_STARTED_AT,
            KEY_TRIAL_EXPIRES_AT,
            KEY_LICENSE_KEY,
            KEY_LICENSE_TIER,
            KEY_LICENSE_BILLING_TYPE,
        ],
    )
    .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;
    Ok(())
}

fn get_kv(key: &str) -> Result<Option<String>, CafError> {
    let conn = db::open()?;
    let mut stmt = conn
        .prepare("SELECT value FROM app_kv WHERE key = ?1")
        .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;
    let mut rows = stmt
        .query([key])
        .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;

    if let Some(row) = rows
        .next()
        .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?
    {
        Ok(Some(row.get(0).map_err(|e| {
            CafError::Db(DbError::Generic(e.to_string()))
        })?))
    } else {
        Ok(None)
    }
}
