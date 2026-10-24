//! Thin Tauri command bindings for CAPost.

use caf_core::{CafError, ai, backup, crash, feedback, notes, prefs, profiles, vault};

async fn run_blocking<F, R>(f: F) -> Result<R, CafError>
where
    F: FnOnce() -> Result<R, CafError> + Send + 'static,
    R: Send + 'static,
{
    tokio::task::spawn_blocking(f).await.map_err(|e| {
        caf_core::CafError::Io(caf_core::error::IoError::Generic(format!(
            "Task join error: {e}"
        )))
    })?
}

// Window management commands
#[tauri::command]
pub async fn window_minimize(#[allow(unused_variables)] window: tauri::Window) {
    #[cfg(not(target_os = "android"))]
    let _ = window.minimize();
}

#[tauri::command]
pub async fn window_maximize(#[allow(unused_variables)] window: tauri::Window) {
    #[cfg(not(target_os = "android"))]
    {
        if let Ok(max) = window.is_maximized() {
            if max {
                let _ = window.unmaximize();
            } else {
                let _ = window.maximize();
            }
        } else {
            let _ = window.maximize();
        }
    }
}

#[tauri::command]
pub async fn window_close(#[allow(unused_variables)] window: tauri::Window) {
    #[cfg(not(target_os = "android"))]
    let _ = window.close();
}

#[tauri::command]
pub async fn window_start_dragging(#[allow(unused_variables)] window: tauri::Window) {
    #[cfg(not(target_os = "android"))]
    let _ = window.start_dragging();
}

// Vault commands
#[tauri::command]
pub async fn is_vault_initialized() -> Result<bool, CafError> {
    run_blocking(vault::is_vault_initialized).await
}

#[tauri::command]
pub async fn validate_vault_password(password: String) -> Result<bool, CafError> {
    run_blocking(move || vault::validate_password(&password)).await
}

#[tauri::command]
pub async fn lock_vault() -> Result<(), CafError> {
    run_blocking(move || {
        vault::lock();
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn change_master_password(
    old_password: String,
    new_password: String,
) -> Result<(), CafError> {
    run_blocking(move || vault::change_master_password(&old_password, &new_password)).await
}

#[tauri::command]
pub async fn reset_vault() -> Result<(), CafError> {
    run_blocking(vault::reset_vault).await
}

// Profile commands
#[tauri::command]
pub async fn list_profiles() -> Result<Vec<profiles::ProfileRecord>, CafError> {
    run_blocking(profiles::list_profiles).await
}

#[tauri::command]
pub async fn save_profile(
    input: profiles::ProfileInput,
    caller_profile_id: String,
) -> Result<profiles::ProfileRecord, CafError> {
    run_blocking(move || profiles::save_profile(input, &caller_profile_id)).await
}

#[tauri::command]
pub async fn verify_pin(profile_id: String, pin: String) -> Result<bool, CafError> {
    run_blocking(move || profiles::verify_pin(&profile_id, &pin)).await
}

// Notes sample commands (Vertical slice)
#[tauri::command]
pub async fn list_notes(
    caller_profile_id: String,
    is_owner: bool,
) -> Result<Vec<notes::NoteRecord>, CafError> {
    run_blocking(move || notes::list_notes(&caller_profile_id, is_owner)).await
}

#[tauri::command]
pub async fn save_note(
    input: notes::NoteInput,
    caller_profile_id: String,
) -> Result<notes::NoteRecord, CafError> {
    run_blocking(move || notes::save_note(input, &caller_profile_id)).await
}

#[tauri::command]
pub async fn delete_note(id: String, caller_profile_id: String) -> Result<(), CafError> {
    run_blocking(move || notes::delete_note(&id, &caller_profile_id)).await
}

// AI commands
#[tauri::command]
pub async fn get_ai_settings() -> Result<ai::AiSettings, CafError> {
    run_blocking(ai::get_settings).await
}

#[tauri::command]
pub async fn save_ai_settings(settings: ai::AiSettings) -> Result<(), CafError> {
    run_blocking(move || ai::save_settings(&settings)).await
}

#[tauri::command]
pub async fn set_ai_api_key(api_key: String) -> Result<(), CafError> {
    run_blocking(move || ai::set_ai_api_key(&api_key)).await
}

#[tauri::command]
pub async fn clear_ai_api_key() -> Result<(), CafError> {
    run_blocking(ai::clear_ai_api_key).await
}

#[tauri::command]
pub async fn ai_preview_context(level: ai::PrivacyLevel) -> Result<ai::ContextPayload, CafError> {
    run_blocking(move || ai::preview_context_for_current_session(level)).await
}

#[tauri::command]
pub async fn ai_chat(
    prompt: String,
    privacy_level: Option<ai::PrivacyLevel>,
    consent_given: Option<bool>,
) -> Result<ai::AiChatResponse, CafError> {
    run_blocking(move || {
        let session = caf_core::session::get_current_session().unwrap_or_else(|_| {
            caf_core::session::Session::new("default", "member")
        });
        ai::chat(&session, &prompt, privacy_level, consent_given.unwrap_or(false))
    })
    .await
}

#[tauri::command]
pub async fn ai_get_providers() -> Result<Vec<ai::AiProviderSummary>, CafError> {
    run_blocking(ai::get_all_providers).await
}

#[tauri::command]
pub async fn ai_save_provider(provider: ai::AiProviderConfig) -> Result<(), CafError> {
    run_blocking(move || ai::save_ai_provider(provider)).await
}

#[tauri::command]
pub async fn ai_delete_provider(id: String) -> Result<(), CafError> {
    run_blocking(move || ai::delete_ai_provider(&id)).await
}

#[tauri::command]
pub async fn ai_get_routing_matrix() -> Result<Vec<ai::TaskRouteRule>, CafError> {
    run_blocking(ai::get_task_routing_matrix).await
}

#[tauri::command]
pub async fn ai_save_routing_rule(rule: ai::TaskRouteRule) -> Result<(), CafError> {
    run_blocking(move || ai::save_task_routing_rule(rule)).await
}

#[tauri::command]
pub async fn ai_get_personas() -> Result<Vec<ai::SystemPersona>, CafError> {
    run_blocking(ai::get_user_personas).await
}

#[tauri::command]
pub async fn ai_save_persona(persona: ai::SystemPersona) -> Result<(), CafError> {
    run_blocking(move || ai::save_user_persona(persona)).await
}

#[tauri::command]
pub async fn ai_delete_persona(id: String) -> Result<(), CafError> {
    run_blocking(move || ai::delete_user_persona(&id)).await
}

#[tauri::command]
pub async fn ai_get_habits() -> Result<Vec<ai::HabitFact>, CafError> {
    run_blocking(ai::get_habit_memories).await
}

#[tauri::command]
pub async fn ai_search_habits(query: String, limit: Option<usize>) -> Result<Vec<ai::HabitFact>, CafError> {
    run_blocking(move || ai::search_habit_memories(&query, limit.unwrap_or(20))).await
}

#[tauri::command]
pub async fn ai_toggle_habit_pin(id: String) -> Result<bool, CafError> {
    run_blocking(move || ai::toggle_habit_pin_status(&id)).await
}

#[tauri::command]
pub async fn ai_delete_habit(id: String) -> Result<(), CafError> {
    run_blocking(move || ai::delete_habit_memory(&id)).await
}

#[tauri::command]
pub async fn ai_get_skills() -> Result<Vec<ai::CustomSkill>, CafError> {
    run_blocking(ai::get_all_skills).await
}

#[tauri::command]
pub async fn ai_save_skill(skill: ai::CustomSkill) -> Result<(), CafError> {
    run_blocking(move || ai::save_custom_skill(skill)).await
}

#[tauri::command]
pub async fn ai_delete_skill(id: String) -> Result<(), CafError> {
    run_blocking(move || ai::delete_custom_skill(&id)).await
}

#[tauri::command]
pub async fn ai_dispatch_task(
    task_type: String,
    query: String,
    terminal_ctx: Option<ai::TerminalContext>,
) -> Result<ai::DispatchResult, CafError> {
    let tt = ai::TaskType::from_str_opt(&task_type).unwrap_or(ai::TaskType::Chat);
    run_blocking(move || ai::dispatch_task(tt, &query, terminal_ctx)).await
}

#[tauri::command]
pub async fn ai_dispatch_task_with_skill(
    task_type: String,
    query: String,
    skill_name: Option<String>,
    terminal_ctx: Option<ai::TerminalContext>,
) -> Result<ai::DispatchResult, CafError> {
    let tt = ai::TaskType::from_str_opt(&task_type).unwrap_or(ai::TaskType::Chat);
    run_blocking(move || ai::dispatch_task_with_skill(tt, &query, skill_name, terminal_ctx)).await
}

// Feedback & Crash commands
#[tauri::command]
pub async fn submit_feedback(
    rating: i32,
    content: String,
    name: Option<String>,
    profession: Option<String>,
) -> Result<(), CafError> {
    run_blocking(move || {
        feedback::submit_feedback(rating, &content, name.as_deref(), profession.as_deref())
    })
    .await
}

#[tauri::command]
pub async fn get_pending_crash_report() -> Result<Option<crash::ScrubbedCrashReport>, CafError> {
    run_blocking(crash::pending_crash_report).await
}

#[tauri::command]
pub async fn dismiss_crash_report(id: String, never_again: Option<bool>) -> Result<(), CafError> {
    run_blocking(move || crash::dismiss_crash_report(&id, never_again.unwrap_or(false))).await
}

// Backup commands
#[tauri::command]
pub async fn export_encrypted_backup(password: String) -> Result<Vec<u8>, CafError> {
    run_blocking(move || backup::export_backup(&password)).await
}

#[tauri::command]
pub async fn import_encrypted_backup(data: Vec<u8>, password: String) -> Result<(), CafError> {
    run_blocking(move || backup::import_backup(&data, &password)).await
}

// Performance & Preferences
#[tauri::command]
pub async fn get_performance_prefs() -> Result<prefs::PerformancePrefs, CafError> {
    run_blocking(prefs::load_performance_prefs).await
}

#[tauri::command]
pub async fn set_performance_prefs(prefs: prefs::PerformancePrefs) -> Result<(), CafError> {
    run_blocking(move || prefs::save_performance_prefs(&prefs)).await
}

// HTTP Workbench
#[tauri::command]
pub async fn http_execute_request(
    payload: caf_core::http::HttpRequestPayload,
) -> Result<caf_core::http::HttpResponsePayload, CafError> {
    caf_core::http::execute_workbench_request(payload).await
}

async fn record_request_history(
    method: &str,
    url: &str,
    resp: &caf_core::http_engine::HttpResponsePayload,
) {
    let method = method.to_string();
    let url = url.to_string();
    let resp = resp.clone();
    let _ = run_blocking(move || {
        let _ = caf_core::schema::record_history(
            &method,
            &url,
            resp.status_code,
            resp.latency_ms,
            resp.size_bytes,
        );
        Ok(())
    })
    .await;
}

// HTTP Engine & Domain Storage Commands
#[tauri::command]
pub async fn http_send_request(
    payload: caf_core::http_engine::HttpRequestPayload,
) -> Result<caf_core::http_engine::HttpResponsePayload, CafError> {
    let (method, url) = (payload.method.as_str().to_string(), payload.url.clone());
    let resp = caf_core::http_engine::execute_request(payload).await?;
    record_request_history(&method, &url, &resp).await;
    Ok(resp)
}

#[tauri::command]
pub async fn list_requests(
    collection_id: Option<String>,
) -> Result<Vec<caf_core::schema::RequestRecord>, CafError> {
    run_blocking(move || caf_core::schema::list_requests(collection_id.as_deref())).await
}

#[tauri::command]
pub async fn save_request(
    input: caf_core::schema::RequestInput,
) -> Result<caf_core::schema::RequestRecord, CafError> {
    run_blocking(move || caf_core::schema::save_request(input)).await
}

#[tauri::command]
pub async fn delete_request(id: String) -> Result<(), CafError> {
    run_blocking(move || caf_core::schema::delete_request(&id)).await
}

#[tauri::command]
pub async fn list_collections() -> Result<Vec<caf_core::schema::CollectionRecord>, CafError> {
    run_blocking(caf_core::schema::list_collections).await
}

#[tauri::command]
pub async fn save_collection(
    input: caf_core::schema::CollectionInput,
) -> Result<caf_core::schema::CollectionRecord, CafError> {
    run_blocking(move || caf_core::schema::save_collection(input)).await
}

#[tauri::command]
pub async fn list_history(
    limit: Option<usize>,
) -> Result<Vec<caf_core::schema::HistoryRecord>, CafError> {
    run_blocking(move || caf_core::schema::list_history(limit)).await
}

#[tauri::command]
pub async fn clear_history() -> Result<(), CafError> {
    run_blocking(caf_core::schema::clear_history).await
}

#[tauri::command]
pub async fn list_environments() -> Result<Vec<caf_core::schema::EnvironmentRecord>, CafError> {
    run_blocking(caf_core::schema::list_environments).await
}

#[tauri::command]
pub async fn save_environment(
    input: caf_core::schema::EnvironmentInput,
) -> Result<caf_core::schema::EnvironmentRecord, CafError> {
    run_blocking(move || caf_core::schema::save_environment(input)).await
}

// Billing & Licensing commands
#[tauri::command]
pub async fn billing_get_state() -> Result<caf_core::billing::state::EffectiveState, CafError> {
    run_blocking(caf_core::billing::get_effective_state).await
}

#[tauri::command]
pub async fn billing_get_effective_state() -> Result<caf_core::billing::state::EffectiveState, CafError> {
    run_blocking(caf_core::billing::get_effective_state).await
}

#[tauri::command]
pub async fn billing_activate_license(
    #[allow(non_snake_case)] licenseKey: Option<String>,
    license_key: Option<String>,
) -> Result<caf_core::billing::state::EffectiveState, CafError> {
    let key = licenseKey.or(license_key).unwrap_or_default();
    run_blocking(move || caf_core::billing::activate_license(&key)).await
}

#[tauri::command]
pub async fn billing_start_trial() -> Result<caf_core::billing::state::EffectiveState, CafError> {
    run_blocking(caf_core::billing::start_trial).await
}

#[tauri::command]
pub async fn billing_sign_out() -> Result<(), CafError> {
    run_blocking(caf_core::billing::sign_out).await
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), CafError> {
    #[cfg(target_os = "linux")]
    let _ = std::process::Command::new("xdg-open").arg(&url).spawn();
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("cmd").args(["/C", "start", "", &url]).spawn();
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(&url).spawn();
    Ok(())
}

