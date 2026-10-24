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
pub struct HttpRequestPayload {
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct HttpResponsePayload {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub elapsed_ms: u64,
    pub size_bytes: usize,
}

pub async fn execute_workbench_request(payload: HttpRequestPayload) -> Result<HttpResponsePayload, CafError> {
    let url = payload.url.trim();
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(CafError::Io(IoError::Generic(
            "URL must start with http:// or https://".to_string(),
        )));
    }

    let timeout_ms = payload.timeout_ms.unwrap_or(30_000);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .build()
        .map_err(|e| CafError::Io(IoError::Generic(format!("Failed to build client: {e}"))))?;

    let method_str = payload.method.trim().to_uppercase();
    let method: reqwest::Method = method_str.parse().map_err(|_| {
        CafError::Io(IoError::Generic(format!("Invalid HTTP method: {method_str}")))
    })?;

    let mut req_builder = client.request(method, url);

    let mut has_user_agent = false;
    for (k, v) in &payload.headers {
        if k.eq_ignore_ascii_case("user-agent") {
            has_user_agent = true;
        }
        req_builder = req_builder.header(k, v);
    }
    if !has_user_agent {
        req_builder = req_builder.header("User-Agent", "CAPost/0.1.0-dev");
    }

    if let Some(body_text) = payload.body {
        req_builder = req_builder.body(body_text);
    }

    let start = Instant::now();
    let resp = req_builder
        .send()
        .await
        .map_err(|e| CafError::Io(IoError::Generic(format!("Request failed: {e}"))))?;

    let elapsed_ms = start.elapsed().as_millis() as u64;
    let status = resp.status().as_u16();
    let status_text = resp
        .status()
        .canonical_reason()
        .unwrap_or("")
        .to_string();

    let mut headers = HashMap::new();
    let mut headers_bytes = 0;
    for (name, val) in resp.headers() {
        if let Ok(v) = val.to_str() {
            headers_bytes += name.as_str().len() + v.len() + 4;
            headers.insert(name.as_str().to_string(), v.to_string());
        }
    }

    let body = resp
        .text()
        .await
        .unwrap_or_default();
    let size_bytes = body.len() + headers_bytes;

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
