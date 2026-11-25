//! Shared HTTP client for CAPost.
//!
//! Enforces:
//! - Connect timeout: 10s
//! - Request timeout: 30s (AI default 120s)
//! - User-Agent: <slug>/<version> (+<brand.website>)
//! - HTTPS only (except loopback: localhost, 127.0.0.1, [::1])
//! - Header `X-CA-App-Id: <identifier>` and JSON field `app_id` on every GCC call

use crate::error::{CafError, IoError};
use std::collections::HashMap;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MultipartField {
    pub name: String,
    #[serde(default)]
    pub value: Option<String>,
    /// Absolute path of a local file to upload for this field.
    #[serde(default)]
    pub file_path: Option<String>,
    #[serde(default)]
    pub content_type: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct HttpRequestPayload {
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    /// multipart/form-data fields (text and files). Takes precedence over `body`.
    #[serde(default)]
    pub multipart: Option<Vec<MultipartField>>,
    /// Send the raw bytes of this local file as the body ("binary" body).
    #[serde(default)]
    pub body_file: Option<String>,
    /// Skip TLS certificate verification (self-signed dev servers).
    #[serde(default)]
    pub insecure: Option<bool>,
    /// Follow 3xx redirects automatically (default true).
    #[serde(default)]
    pub follow_redirects: Option<bool>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct HttpResponsePayload {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub elapsed_ms: u64,
    pub size_bytes: usize,
    /// URL after redirects.
    #[serde(default)]
    pub url: String,
}

fn io_err(msg: String) -> CafError {
    CafError::Io(IoError::Generic(msg))
}

/// Cookie jar shared by every workbench client, like Postman's cookie store.
fn cookie_jar() -> std::sync::Arc<reqwest::cookie::Jar> {
    static JAR: std::sync::OnceLock<std::sync::Arc<reqwest::cookie::Jar>> = std::sync::OnceLock::new();
    JAR.get_or_init(|| std::sync::Arc::new(reqwest::cookie::Jar::default()))
        .clone()
}

/// Process-wide pooled clients (one per TLS/redirect policy) that keep TCP/TLS
/// connections alive between workbench requests, so repeat calls skip the handshake.
fn workbench_client(insecure: bool, follow: bool) -> Result<&'static reqwest::Client, CafError> {
    static CLIENTS: [std::sync::OnceLock<reqwest::Client>; 4] = [
        std::sync::OnceLock::new(),
        std::sync::OnceLock::new(),
        std::sync::OnceLock::new(),
        std::sync::OnceLock::new(),
    ];
    let slot = &CLIENTS[(insecure as usize) * 2 + follow as usize];
    if let Some(c) = slot.get() {
        return Ok(c);
    }
    let policy = if follow {
        reqwest::redirect::Policy::limited(10)
    } else {
        reqwest::redirect::Policy::none()
    };
    let built = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .pool_idle_timeout(Duration::from_secs(90))
        .pool_max_idle_per_host(8)
        .tcp_nodelay(true)
        .cookie_provider(cookie_jar())
        .redirect(policy)
        .danger_accept_invalid_certs(insecure)
        .build()
        .map_err(|e| io_err(format!("Failed to build client: {e}")))?;
    Ok(slot.get_or_init(|| built))
}

fn file_name_of(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "file".to_string())
}

pub async fn execute_workbench_request(payload: HttpRequestPayload) -> Result<HttpResponsePayload, CafError> {
    let url = payload.url.trim();
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(io_err("URL must start with http:// or https://".to_string()));
    }

    let timeout_ms = payload.timeout_ms.unwrap_or(30_000);
    let client = workbench_client(
        payload.insecure.unwrap_or(false),
        payload.follow_redirects.unwrap_or(true),
    )?;

    let method_str = payload.method.trim().to_uppercase();
    let method: reqwest::Method = method_str
        .parse()
        .map_err(|_| io_err(format!("Invalid HTTP method: {method_str}")))?;

    let mut req_builder = client
        .request(method, url)
        .timeout(Duration::from_millis(timeout_ms));

    let is_multipart = payload.multipart.is_some();
    let mut has_user_agent = false;
    for (k, v) in &payload.headers {
        if k.eq_ignore_ascii_case("user-agent") {
            has_user_agent = true;
        }
        // reqwest sets the multipart boundary itself.
        if is_multipart && k.eq_ignore_ascii_case("content-type") {
            continue;
        }
        req_builder = req_builder.header(k, v);
    }
    if !has_user_agent {
        req_builder = req_builder.header(
            "User-Agent",
            concat!("CAPost/", env!("CARGO_PKG_VERSION")),
        );
    }

    if let Some(fields) = payload.multipart {
        let mut form = reqwest::multipart::Form::new();
        for f in fields {
            let mut part = if let Some(path) = f.file_path.as_deref().filter(|p| !p.is_empty()) {
                let bytes = std::fs::read(path)
                    .map_err(|e| io_err(format!("Cannot read file for field '{}': {e}", f.name)))?;
                reqwest::multipart::Part::bytes(bytes).file_name(file_name_of(path))
            } else {
                reqwest::multipart::Part::text(f.value.unwrap_or_default())
            };
            if let Some(ct) = f.content_type.as_deref().filter(|c| !c.is_empty()) {
                part = part
                    .mime_str(ct)
                    .map_err(|e| io_err(format!("Invalid content type '{ct}': {e}")))?;
            }
            form = form.part(f.name, part);
        }
        req_builder = req_builder.multipart(form);
    } else if let Some(path) = payload.body_file.as_deref().filter(|p| !p.is_empty()) {
        let bytes = std::fs::read(path).map_err(|e| io_err(format!("Cannot read body file: {e}")))?;
        req_builder = req_builder.body(bytes);
    } else if let Some(body_text) = payload.body {
        req_builder = req_builder.body(body_text);
    }

    let start = Instant::now();
    let resp = req_builder.send().await.map_err(|e| {
        // Surface the root cause (DNS, TLS, refused) instead of reqwest's generic wrapper.
        let mut msg = format!("{e}");
        let mut src = std::error::Error::source(&e);
        while let Some(s) = src {
            msg.push_str(&format!(": {s}"));
            src = s.source();
        }
        io_err(format!("Request failed: {msg}"))
    })?;

    let final_url = resp.url().to_string();
    let status = resp.status().as_u16();
    let status_text = resp
        .status()
        .canonical_reason()
        .unwrap_or("")
        .to_string();

    let mut headers: HashMap<String, String> = HashMap::new();
    let mut headers_bytes = 0;
    for (name, val) in resp.headers() {
        if let Ok(v) = val.to_str() {
            headers_bytes += name.as_str().len() + v.len() + 4;
            // Keep repeated headers (e.g. set-cookie) instead of overwriting.
            headers
                .entry(name.as_str().to_string())
                .and_modify(|existing| {
                    existing.push_str(", ");
                    existing.push_str(v);
                })
                .or_insert_with(|| v.to_string());
        }
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| io_err(format!("Failed to read body: {e}")))?;
    let size_bytes = bytes.len() + headers_bytes;
    let body = String::from_utf8_lossy(&bytes).into_owned();
    let elapsed_ms = start.elapsed().as_millis() as u64;

    Ok(HttpResponsePayload {
        status,
        status_text: if status_text.is_empty() {
            format!("{status}")
        } else {
            status_text
        },
        headers,
        body,
        elapsed_ms,
        size_bytes,
        url: final_url,
    })
}

#[derive(Debug, Clone)]
pub struct HttpClientConfig {
    pub slug: String,
    pub version: String,
    pub brand_website: String,
    pub app_identifier: String,
}

impl Default for HttpClientConfig {
    fn default() -> Self {
        Self {
            slug: "capost".to_string(),
            version: "0.1.0-dev".to_string(),
            brand_website: "https://www.cecepazhar.com".to_string(),
            app_identifier: "com.fathforce.capost".to_string(),
        }
    }
}

pub struct HttpClient {
    config: HttpClientConfig,
}

impl HttpClient {
    pub fn new(config: HttpClientConfig) -> Self {
        Self { config }
    }

    pub fn default_client() -> Self {
        Self::new(HttpClientConfig::default())
    }

    pub fn user_agent(&self) -> String {
        format!(
            "{}/{} (+{})",
            self.config.slug, self.config.version, self.config.brand_website
        )
    }

    pub fn validate_url(&self, url: &str) -> Result<(), CafError> {
        let is_https = url.starts_with("https://");
        let is_loopback = url.starts_with("http://localhost")
            || url.starts_with("http://127.0.0.1")
            || url.starts_with("http://[::1]");

        if is_https || is_loopback {
            Ok(())
        } else {
            Err(CafError::Io(IoError::Generic(
                "Insecure HTTP connection disallowed for non-loopback hosts".into(),
            )))
        }
    }

    pub fn post_json<T: serde::Serialize>(
        &self,
        url: &str,
        payload: &T,
        timeout_secs: u64,
    ) -> Result<String, CafError> {
        self.validate_url(url)?;

        let agent = ureq::Agent::config_builder()
            .timeout_global(Some(Duration::from_secs(timeout_secs)))
            .build()
            .new_agent();

        let mut resp = agent
            .post(url)
            .header("User-Agent", &self.user_agent())
            .header("X-CA-App-Id", &self.config.app_identifier)
            .header("Content-Type", "application/json")
            .send_json(payload)
            .map_err(|e| CafError::Io(IoError::Generic(format!("HTTP request failed: {e}"))))?;

        let status = resp.status().as_u16();
        let body = resp.body_mut().read_to_string().unwrap_or_default();

        if (200..300).contains(&status) {
            Ok(body)
        } else {
            Err(CafError::Io(IoError::Generic(format!(
                "HTTP request returned status {status}: {body}"
            ))))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_agent_format() {
        let client = HttpClient::default_client();
        assert_eq!(
            client.user_agent(),
            "capost/0.1.0-dev (+https://www.cecepazhar.com)"
        );
    }

    #[test]
    fn test_url_validation_https_and_loopback() {
        let client = HttpClient::default_client();
        assert!(client.validate_url("https://api.example.com/v1").is_ok());
        assert!(client.validate_url("http://localhost:11434/v1").is_ok());
        assert!(client.validate_url("http://127.0.0.1:8080/v1").is_ok());
        assert!(
            client
                .validate_url("http://insecure.example.com/v1")
                .is_err()
        );
    }
}
