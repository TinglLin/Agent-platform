-- 智汇平台 Demo 业务库 DDL（IMPLEMENTATION_PLAN.md §4.2）
-- 由 repositories/db.py 在启动时执行；与 SQLAlchemy models 保持一致

CREATE TABLE IF NOT EXISTS workflows (
    workflow_id       TEXT PRIMARY KEY,
    name              TEXT NOT NULL DEFAULT '未命名应用',
    description       TEXT,
    icon              TEXT,
    current_version   TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workflows_updated ON workflows (updated_at);

CREATE TABLE IF NOT EXISTS workflow_versions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id       TEXT NOT NULL,
    version           TEXT NOT NULL,
    graph_spec_json   TEXT NOT NULL,
    is_major          INTEGER NOT NULL DEFAULT 0,
    base_version      TEXT,
    published_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (workflow_id) REFERENCES workflows (workflow_id),
    UNIQUE (workflow_id, version)
);

CREATE INDEX IF NOT EXISTS idx_wv_workflow ON workflow_versions (workflow_id);

CREATE TABLE IF NOT EXISTS workflow_drafts (
    workflow_id       TEXT PRIMARY KEY,
    canvas_json       TEXT NOT NULL,
    updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (workflow_id) REFERENCES workflows (workflow_id)
);

CREATE TABLE IF NOT EXISTS threads (
    thread_id         TEXT PRIMARY KEY,
    workflow_id       TEXT NOT NULL,
    workflow_version  TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'running'
                      CHECK (status IN ('running', 'waiting_human', 'completed', 'failed')),
    checkpoint_ns     TEXT,
    pending_node_id   TEXT,
    pending_question  TEXT,
    final_output      TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (workflow_id) REFERENCES workflows (workflow_id)
);

CREATE INDEX IF NOT EXISTS idx_threads_workflow ON threads (workflow_id);
CREATE INDEX IF NOT EXISTS idx_threads_status ON threads (status);

CREATE TABLE IF NOT EXISTS thread_messages (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id         TEXT NOT NULL,
    role              TEXT NOT NULL
                      CHECK (role IN ('user', 'assistant', 'system', 'human_waiting')),
    content           TEXT NOT NULL,
    node_id           TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (thread_id) REFERENCES threads (thread_id)
);

CREATE INDEX IF NOT EXISTS idx_tm_thread ON thread_messages (thread_id);

CREATE TABLE IF NOT EXISTS user_apps (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id       TEXT NOT NULL UNIQUE,
    last_thread_id    TEXT,
    added_at          TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (workflow_id) REFERENCES workflows (workflow_id),
    FOREIGN KEY (last_thread_id) REFERENCES threads (thread_id)
);
