//! HTTP execution engine for CAPost.
//!
//! Provides reqwest-based HTTP client execution with support for custom methods,
//! headers, query parameters, timeouts, and diverse body formats (JSON, FormUrlEncoded,
//! FormData, Raw, None).

use crate::error::{CafError, IoError, ValidationError};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum HttpMethod {
    #[serde(alias = "get", alias = "Get")]
    Get,
    #[serde(alias = "post", alias = "Post")]
    Post,
    #[serde(alias = "put", alias = "Put")]
    Put,
    #[serde(alias = "patch", alias = "Patch")]
    Patch,
    #[serde(alias = "delete", alias = "Delete")]
    Delete,
    #[serde(alias = "head", alias = "Head")]
    Head,
    #[serde(alias = "options", alias = "Options")]
    Options,
}

impl HttpMethod {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Get => "GET",
            Self::Post => "POST",
            Self::Put => "PUT",
            Self::Patch => "PATCH",
            Self::Delete => "DELETE",
            Self::Head => "HEAD",
            Self::Options => "OPTIONS",
        }
    }
}

impl std::fmt::Display for HttpMethod {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for HttpMethod {
    type Err = CafError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "GET" => Ok(Self::Get),
            "POST" => Ok(Self::Post),
            "PUT" => Ok(Self::Put),
            "PATCH" => Ok(Self::Patch),
            "DELETE" => Ok(Self::Delete),
            "HEAD" => Ok(Self::Head),
            "OPTIONS" => Ok(Self::Options),
            _ => Err(CafError::Validation(ValidationError::InvalidFormat)),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum HttpRequestBody {
    #[default]
    #[serde(alias = "none", alias = "None")]
    None,
    #[serde(alias = "json", alias = "Json")]
    Json {
        #[serde(alias = "data", alias = "value")]
        content: String,
    },
    #[serde(alias = "form_url_encoded", alias = "formUrlEncoded", alias = "FormUrlEncoded")]
    FormUrlEncoded {
        #[serde(alias = "data", alias = "values", alias = "fields")]
        fields: HashMap<String, String>,
    },
    #[serde(alias = "form_data", alias = "formData", alias = "FormData")]
    FormData {
        #[serde(alias = "data", alias = "values", alias = "fields")]
        fields: HashMap<String, String>,
    },
    #[serde(alias = "raw", alias = "Raw")]
    Raw {
        #[serde(alias = "data", alias = "value")]
        content: String,
        #[serde(default)]
        content_type: Option<String>,
    },
}

impl HttpRequestBody {
    pub fn json(content: impl Into<String>) -> Self {
        Self::Json {
            content: content.into(),
        }
    }

    pub fn form_url_encoded(fields: HashMap<String, String>) -> Self {
        Self::FormUrlEncoded { fields }
    }

    pub fn form_data(fields: HashMap<String, String>) -> Self {
        Self::FormData { fields }
    }

    pub fn raw(content: impl Into<String>, content_type: Option<String>) -> Self {
        Self::Raw {
            content: content.into(),
            content_type,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HttpRequestPayload {
    pub method: HttpMethod,
    pub url: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub query_params: Option<HashMap<String, String>>,
    #[serde(default)]
    pub body: HttpRequestBody,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

impl HttpRequestPayload {
    pub fn new(method: HttpMethod, url: impl Into<String>) -> Self {
        Self {
            method,
            url: url.into(),
            headers: HashMap::new(),
            query_params: None,
            body: HttpRequestBody::None,
            timeout_ms: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HttpResponsePayload {
    pub status_code: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub latency_ms: u64,
    pub size_bytes: usize,
}

pub async fn execute_request(payload: HttpRequestPayload) -> Result<HttpResponsePayload, CafError> {
    let timeout_duration = Duration::from_millis(payload.timeout_ms.unwrap_or(30_000));
    let client = reqwest::Client::builder()
        .timeout(timeout_duration)
        .build()
        .map_err(|e| CafError::Io(IoError::Generic(format!("Failed to build HTTP client: {e}"))))?;

    let reqwest_method = match payload.method {
        HttpMethod::Get => reqwest::Method::GET,
        HttpMethod::Post => reqwest::Method::POST,
        HttpMethod::Put => reqwest::Method::PUT,
        HttpMethod::Patch => reqwest::Method::PATCH,
        HttpMethod::Delete => reqwest::Method::DELETE,
        HttpMethod::Head => reqwest::Method::HEAD,
        HttpMethod::Options => reqwest::Method::OPTIONS,
    };

    let mut builder = client.request(reqwest_method, &payload.url);

    for (k, v) in &payload.headers {
        builder = builder.header(k, v);
    }

    if let Some(ref params) = payload.query_params {
        builder = builder.query(params);
    }

    match payload.body {
        HttpRequestBody::None => {}
        HttpRequestBody::Json { content } => {
            let has_content_type = payload
                .headers
                .keys()
                .any(|k| k.eq_ignore_ascii_case("content-type"));
            if !has_content_type {
                builder = builder.header("content-type", "application/json");
            }
            builder = builder.body(content);
        }
        HttpRequestBody::FormUrlEncoded { fields } => {
            builder = builder.form(&fields);
        }
        HttpRequestBody::FormData { fields } => {
            let mut form = reqwest::multipart::Form::new();
            for (k, v) in fields {
                form = form.text(k, v);
            }
            builder = builder.multipart(form);
        }
        HttpRequestBody::Raw {
            content,
            content_type,
        } => {
            if let Some(ct) = content_type {
                let has_content_type = payload
                    .headers
                    .keys()
                    .any(|k| k.eq_ignore_ascii_case("content-type"));
                if !has_content_type {
                    builder = builder.header("content-type", ct);
                }
            }
            builder = builder.body(content);
        }
    }

    let start = std::time::Instant::now();
    let resp = builder.send().await.map_err(|e| {
        CafError::Io(IoError::Generic(format!("HTTP request failed: {e}")))
    })?;
    let latency_ms = start.elapsed().as_millis() as u64;

    let status_code = resp.status().as_u16();
    let status_text = resp.status().canonical_reason().unwrap_or("").to_string();

    let mut headers = HashMap::new();
    for (name, val) in resp.headers() {
        if let Ok(v) = val.to_str() {
            headers.insert(name.as_str().to_string(), v.to_string());
        }
    }

    let bytes = resp.bytes().await.map_err(|e| {
        CafError::Io(IoError::Generic(format!("Failed to read response body: {e}")))
    })?;
    let size_bytes = bytes.len();
    let body = String::from_utf8_lossy(&bytes).into_owned();

    Ok(HttpResponsePayload {
        status_code,
        status_text,
        headers,
        body,
        latency_ms,
        size_bytes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        routing::{get, post},
        Router,
    };
    use tokio::net::TcpListener;

    #[test]
    fn test_http_method_str_and_parse() {
        let methods = [
            (HttpMethod::Get, "GET"),
            (HttpMethod::Post, "POST"),
            (HttpMethod::Put, "PUT"),
            (HttpMethod::Patch, "PATCH"),
            (HttpMethod::Delete, "DELETE"),
            (HttpMethod::Head, "HEAD"),
            (HttpMethod::Options, "OPTIONS"),
        ];
        for (m, expected) in methods {
            assert_eq!(m.as_str(), expected);
            assert_eq!(format!("{m}"), expected);
            assert_eq!(expected.parse::<HttpMethod>().unwrap(), m);
            assert_eq!(expected.to_lowercase().parse::<HttpMethod>().unwrap(), m);
        }
        assert!("INVALID".parse::<HttpMethod>().is_err());
    }

    #[test]
    fn test_payload_serialization() {
        let mut headers = HashMap::new();
        headers.insert("Authorization".to_string(), "Bearer token123".to_string());
        let payload = HttpRequestPayload {
            method: HttpMethod::Post,
            url: "https://api.example.com/items".to_string(),
            headers,
            query_params: Some(HashMap::from([(
                "filter".to_string(),
                "active".to_string(),
            )])),
            body: HttpRequestBody::json(r#"{"name":"test"}"#),
            timeout_ms: Some(15000),
        };

        let json = serde_json::to_string(&payload).expect("serialize payload");
        let deserialized: HttpRequestPayload =
            serde_json::from_str(&json).expect("deserialize payload");
        assert_eq!(payload.method, deserialized.method);
        assert_eq!(payload.url, deserialized.url);
        assert_eq!(payload.timeout_ms, deserialized.timeout_ms);
        match deserialized.body {
            HttpRequestBody::Json { content } => assert_eq!(content, r#"{"name":"test"}"#),
            _ => panic!("expected Json body"),
        }
    }

    #[tokio::test]
    async fn test_execute_request_get_and_post() {
        let app = Router::new()
            .route("/test-get", get(|| async { "hello get" }))
            .route(
                "/test-post-json",
                post(|body: String| async move { format!("received: {body}") }),
            );

        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind listener");
        let addr = listener.local_addr().expect("local addr");

        tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });

        // 1. Test GET
        let get_payload = HttpRequestPayload {
            method: HttpMethod::Get,
            url: format!("http://{addr}/test-get"),
            headers: HashMap::new(),
            query_params: None,
            body: HttpRequestBody::None,
            timeout_ms: Some(5000),
        };
        let get_resp = execute_request(get_payload).await.expect("execute GET");
        assert_eq!(get_resp.status_code, 200);
        assert_eq!(get_resp.body, "hello get");
        assert_eq!(get_resp.size_bytes, 9);

        // 2. Test POST JSON
        let post_payload = HttpRequestPayload {
            method: HttpMethod::Post,
            url: format!("http://{addr}/test-post-json"),
            headers: HashMap::new(),
            query_params: None,
            body: HttpRequestBody::json(r#"{"msg":"ping"}"#),
            timeout_ms: Some(5000),
        };
        let post_resp = execute_request(post_payload).await.expect("execute POST");
        assert_eq!(post_resp.status_code, 200);
        assert_eq!(post_resp.body, r#"received: {"msg":"ping"}"#);
    }
}
