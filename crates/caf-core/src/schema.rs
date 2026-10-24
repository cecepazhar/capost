//! Domain data persistence for CAPost API collections, requests, request history,
//! and environments. Each operation touches the encrypted database only; all
//! record structs mirror the exact column definitions specified in the
//! storage schema.

use crate::error::{CafError, DbError};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub fn init_domain_schema(conn: &rusqlite::Connection) -> Result<(), CafError> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS collections (
           id TEXT PRIMARY KEY,
           name TEXT NOT NULL,
           description TEXT,
           created_at INTEGER NOT NULL,
           updated_at INTEGER NOT NULL
         );

         CREATE TABLE IF NOT EXISTS requests (
           id TEXT PRIMARY KEY,
           collection_id TEXT,
           name TEXT NOT NULL,
           method TEXT NOT NULL,
           url TEXT NOT NULL,
           headers_json TEXT NOT NULL DEFAULT '{}',
           body_json TEXT NOT NULL DEFAULT '{}',
           created_at INTEGER NOT NULL
         );

         CREATE TABLE IF NOT EXISTS request_history (
           id TEXT PRIMARY KEY,
           method TEXT NOT NULL,
           url TEXT NOT NULL,
           status_code INTEGER NOT NULL,
           latency_ms INTEGER NOT NULL,
           size_bytes INTEGER NOT NULL,
           created_at INTEGER NOT NULL
         );

         CREATE TABLE IF NOT EXISTS environments (
           id TEXT PRIMARY KEY,
           name TEXT NOT NULL,
           variables_json TEXT NOT NULL DEFAULT '{}',
           is_active INTEGER NOT NULL DEFAULT 0
         );",
    )
    .map_err(|e| CafError::Db(DbError::Generic(format!("gagal init domain schema: {e}"))))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionRecord {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionInput {
    pub id: Option<String>,
    pub name: String,
    pub description: Option<String>,
}

pub fn list_collections() -> Result<Vec<CollectionRecord>, CafError> {
    let conn = crate::db::open()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, description, created_at, updated_at
             FROM collections ORDER BY updated_at DESC",
        )
        .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(CollectionRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?);
    }
    Ok(out)
}

pub fn save_collection(input: CollectionInput) -> Result<CollectionRecord, CafError> {
    let conn = crate::db::open()?;
    let now = chrono::Utc::now().timestamp();

    let id = match &input.id {
        Some(id) => {
            conn.execute(
                "UPDATE collections SET name = ?1, description = ?2, updated_at = ?3 WHERE id = ?4",
                rusqlite::params![
                    input.name,
                    input.description.clone(),
                    now,
                    id,
                ],
            )
            .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;
            id.clone()
        }
        None => {
            let new_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO collections (id, name, description, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![
                    new_id,
                    input.name,
                    input.description.clone(),
                    now,
                    now,
                ],
            )
            .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;
            new_id
        }
    };

    let rec: CollectionRecord = conn
        .query_row(
            "SELECT id, name, description, created_at, updated_at FROM collections WHERE id = ?1",
            [id],
            |row| {
                Ok(CollectionRecord {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            },
        )
        .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;

    Ok(rec)
}

pub fn delete_collection(id: &str) -> Result<(), CafError> {
    let conn = crate::db::open()?;
    conn.execute(
        "DELETE FROM collections WHERE id = ?1",
        [id],
    )
    .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestRecord {
    pub id: String,
    pub collection_id: Option<String>,
    pub name: String,
    pub method: String,
    pub url: String,
    pub headers_json: String,
    pub body_json: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestInput {
    pub id: Option<String>,
    pub collection_id: Option<String>,
    pub name: String,
    pub method: String,
    pub url: String,
    pub headers_json: Option<String>,
    pub body_json: Option<String>,
}

pub fn list_requests(collection_id: Option<&str>) -> Result<Vec<RequestRecord>, CafError> {
    let conn = crate::db::open()?;
    match collection_id {
        Some(cid) => {
            let mut stmt = conn
                .prepare(
                    "SELECT id, collection_id, name, method, url, headers_json, body_json, created_at
                     FROM requests WHERE collection_id = ?1 ORDER BY created_at DESC",
                )
                .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;
            let rows = stmt
                .query_map([cid], request_row_mapper)
                .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;
            let mut out = Vec::new();
            for row in rows {
                out.push(row.map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?);
            }
            Ok(out)
        }
        None => {
            let mut stmt = conn
                .prepare(
                    "SELECT id, collection_id, name, method, url, headers_json, body_json, created_at
                     FROM requests ORDER BY created_at DESC",
                )
                .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;
            let rows = stmt
                .query_map([], request_row_mapper)
                .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;
            let mut out = Vec::new();
            for row in rows {
                out.push(row.map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?);
            }
            Ok(out)
        }
    }
}

fn request_row_mapper(row: &rusqlite::Row) -> rusqlite::Result<RequestRecord> {
    Ok(RequestRecord {
        id: row.get(0)?,
        collection_id: row.get(1)?,
        name: row.get(2)?,
        method: row.get(3)?,
        url: row.get(4)?,
        headers_json: row.get(5)?,
        body_json: row.get(6)?,
        created_at: row.get(7)?,
    })
}

pub fn save_request(input: RequestInput) -> Result<RequestRecord, CafError> {
    let conn = crate::db::open()?;
    let now = chrono::Utc::now().timestamp();
    let headers_json = input.headers_json.unwrap_or_else(|| "{}".into());
    let body_json = input.body_json.unwrap_or_else(|| "{}".into());

    let id = match &input.id {
        Some(id) => {
            conn.execute(
                "UPDATE requests
                 SET collection_id = ?1, name = ?2, method = ?3, url = ?4,
                     headers_json = ?5, body_json = ?6
                 WHERE id = ?7",
                rusqlite::params![
                    input.collection_id.clone(),
                    input.name,
                    input.method,
                    input.url,
                    headers_json,
                    body_json,
                    id,
                ],
            )
            .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;
            id.clone()
        }
        None => {
            let new_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO requests
                 (id, collection_id, name, method, url, headers_json, body_json, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![
                    new_id,
                    input.collection_id.clone(),
                    input.name,
                    input.method,
                    input.url,
                    headers_json,
                    body_json,
                    now,
                ],
            )
            .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;
            new_id
        }
    };

    conn.query_row(
        "SELECT id, collection_id, name, method, url, headers_json, body_json, created_at
         FROM requests WHERE id = ?1",
        [id],
        request_row_mapper,
    )
    .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))
}

pub fn delete_request(id: &str) -> Result<(), CafError> {
    let conn = crate::db::open()?;
    conn.execute("DELETE FROM requests WHERE id = ?1", [id])
        .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Request history
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryRecord {
    pub id: String,
    pub method: String,
    pub url: String,
    pub status_code: u16,
    pub latency_ms: u64,
    pub size_bytes: usize,
    pub created_at: i64,
}

pub fn record_history(
    method: &str,
    url: &str,
    status_code: u16,
    latency_ms: u64,
    size_bytes: usize,
) -> Result<HistoryRecord, CafError> {
    let conn = crate::db::open()?;
    let rec = HistoryRecord {
        id: Uuid::new_v4().to_string(),
        method: method.to_string(),
        url: url.to_string(),
        status_code,
        latency_ms,
        size_bytes,
        created_at: chrono::Utc::now().timestamp(),
    };
    conn.execute(
        "INSERT INTO request_history
         (id, method, url, status_code, latency_ms, size_bytes, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            &rec.id,
            &rec.method,
            &rec.url,
            rec.status_code as i64,
            rec.latency_ms as i64,
            rec.size_bytes as i64,
            rec.created_at,
        ],
    )
    .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;
    Ok(rec)
}

pub fn list_history(limit: Option<usize>) -> Result<Vec<HistoryRecord>, CafError> {
    let conn = crate::db::open()?;
    let lim = limit.unwrap_or(50).min(500);
    let mut stmt = conn
        .prepare(
            "SELECT id, method, url, status_code, latency_ms, size_bytes, created_at
             FROM request_history ORDER BY created_at DESC LIMIT ?1",
        )
        .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;
    let rows = stmt
        .query_map([lim as i64], |row| {
            Ok(HistoryRecord {
                id: row.get(0)?,
                method: row.get(1)?,
                url: row.get(2)?,
                status_code: row.get::<_, i64>(3)? as u16,
                latency_ms: row.get::<_, i64>(4)? as u64,
                size_bytes: row.get::<_, i64>(5)? as usize,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?);
    }
    Ok(out)
}

pub fn clear_history() -> Result<(), CafError> {
    let conn = crate::db::open()?;
    conn.execute("DELETE FROM request_history", [])
        .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Environments
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvironmentRecord {
    pub id: String,
    pub name: String,
    pub variables_json: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvironmentInput {
    pub id: Option<String>,
    pub name: String,
    pub variables_json: String,
    pub is_active: Option<bool>,
}

pub fn list_environments() -> Result<Vec<EnvironmentRecord>, CafError> {
    let conn = crate::db::open()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, variables_json, is_active FROM environments ORDER BY name",
        )
        .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;
    let rows = stmt
        .query_map([], |row| {
            let active_int: i64 = row.get(3)?;
            Ok(EnvironmentRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                variables_json: row.get(2)?,
                is_active: active_int != 0,
            })
        })
        .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?);
    }
    Ok(out)
}

pub fn save_environment(input: EnvironmentInput) -> Result<EnvironmentRecord, CafError> {
    let conn = crate::db::open()?;
    let is_active = input.is_active.unwrap_or(false);

    if is_active {
        conn.execute("UPDATE environments SET is_active = 0", [])
            .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;
    }

    let id = match &input.id {
        Some(id) => {
            conn.execute(
                "UPDATE environments SET name = ?1, variables_json = ?2, is_active = ?3 WHERE id = ?4",
                rusqlite::params![input.name, input.variables_json, is_active as i64, id],
            )
            .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;
            id.clone()
        }
        None => {
            let new_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO environments (id, name, variables_json, is_active) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![new_id, input.name, input.variables_json, is_active as i64],
            )
            .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;
            new_id
        }
    };

    conn.query_row(
        "SELECT id, name, variables_json, is_active FROM environments WHERE id = ?1",
        [id],
        |row| {
            let active_int: i64 = row.get(3)?;
            Ok(EnvironmentRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                variables_json: row.get(2)?,
                is_active: active_int != 0,
            })
        },
    )
    .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))
}

pub fn delete_environment(id: &str) -> Result<(), CafError> {
    let conn = crate::db::open()?;
    conn.execute("DELETE FROM environments WHERE id = ?1", [id])
        .map_err(|e| CafError::Db(DbError::Generic(e.to_string())))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_collection_crud() {
        let _guard = crate::test_support::isolated_data_dir("schema_collection_test");
        let _key = crate::vault::ensure_unlocked_key().expect("vault key");

        let input = CollectionInput {
            id: None,
            name: "Test Collection".into(),
            description: Some("desc".into()),
        };
        let rec = save_collection(input).expect("save_collection");
        assert!(!rec.id.is_empty());
        assert_eq!(rec.name, "Test Collection");

        let list = list_collections().expect("list_collections");
        assert!(list.iter().any(|c| c.id == rec.id));

        delete_collection(&rec.id).expect("delete_collection");
        let list2 = list_collections().expect("list_collections after delete");
        assert!(!list2.iter().any(|c| c.id == rec.id));
    }

    #[test]
    fn test_request_crud() {
        let _guard = crate::test_support::isolated_data_dir("schema_request_test");
        let _key = crate::vault::ensure_unlocked_key().expect("vault key");

        let input = RequestInput {
            id: None,
            collection_id: None,
            name: "GET /ping".into(),
            method: "GET".into(),
            url: "http://localhost:8080/ping".into(),
            headers_json: Some(r#"{"Accept":"application/json"}"#.into()),
            body_json: None,
        };
        let rec = save_request(input).expect("save_request");
        assert!(!rec.id.is_empty());
        assert_eq!(rec.headers_json, r#"{"Accept":"application/json"}"#);
        assert_eq!(rec.body_json, "{}");

        let list = list_requests(None).expect("list_requests");
        assert!(list.iter().any(|r| r.id == rec.id));

        delete_request(&rec.id).expect("delete_request");
        let list2 = list_requests(None).expect("list_requests after delete");
        assert!(!list2.iter().any(|r| r.id == rec.id));
    }

    #[test]
    fn test_history_crud() {
        let _guard = crate::test_support::isolated_data_dir("schema_history_test");
        let _key = crate::vault::ensure_unlocked_key().expect("vault key");

        let rec =
            record_history("GET", "http://localhost:8080", 200, 12, 256).expect("record_history");
        assert!(!rec.id.is_empty());

        let list = list_history(Some(10)).expect("list_history");
        assert!(list.iter().any(|h| h.id == rec.id));

        clear_history().expect("clear_history");
        let list2 = list_history(Some(10)).expect("list_history after clear");
        assert!(list2.is_empty());
    }

    #[test]
    fn test_environment_crud() {
        let _guard = crate::test_support::isolated_data_dir("schema_env_test");
        let _key = crate::vault::ensure_unlocked_key().expect("vault key");

        let input = EnvironmentInput {
            id: None,
            name: "staging".into(),
            variables_json: r#"{"BASE_URL":"https://staging.example.com"}"#.into(),
            is_active: Some(true),
        };
        let rec = save_environment(input).expect("save_environment");
        assert!(!rec.id.is_empty());
        assert!(rec.is_active);

        let list = list_environments().expect("list_environments");
        assert!(list.iter().any(|e| e.id == rec.id));

        delete_environment(&rec.id).expect("delete_environment");
        let list2 = list_environments().expect("list_environments after delete");
        assert!(!list2.iter().any(|e| e.id == rec.id));
    }
}
