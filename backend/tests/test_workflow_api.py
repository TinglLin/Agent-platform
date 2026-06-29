"""P3 工作流发布与列表 API 测试。"""

from __future__ import annotations

import sys
import uuid
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from app import create_app
from config import load_config
from core.checkpointer import init_checkpointer
from repositories.db import init_db

VALID_GRAPH = {
    "nodes": [
        {"id": "s", "type": "start", "position": {"x": 0, "y": 0}, "config": {}},
        {
            "id": "l",
            "type": "llm",
            "position": {"x": 100, "y": 0},
            "config": {"model": "gpt-4", "prompt": "hi"},
        },
        {"id": "e", "type": "end", "position": {"x": 200, "y": 0}, "config": {}},
    ],
    "edges": [
        {"id": "e1", "source": "s", "target": "l"},
        {"id": "e2", "source": "l", "target": "e"},
    ],
}


@pytest.fixture()
def client(tmp_path):
    cfg = load_config()
    db_path = tmp_path / "zhihui.db"
    ckpt_path = tmp_path / "ckpt.db"
    object.__setattr__(cfg, "DATABASE_URL", f"sqlite:///{db_path.as_posix()}")
    object.__setattr__(cfg, "CHECKPOINT_DB_PATH", str(ckpt_path))

    init_db(cfg.DATABASE_URL)
    init_checkpointer(cfg.CHECKPOINT_DB_PATH)
    app = create_app(cfg)
    app.config["TESTING"] = True
    return app.test_client()


def test_publish_and_playground(client):
    wf_id = f"wf_{uuid.uuid4().hex[:8]}"
    resp = client.post(
        "/api/workflows/publish",
        json={
            "name": "测试应用",
            "description": "desc",
            "workflow_id": wf_id,
            "graph_spec": VALID_GRAPH,
        },
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["code"] == 0
    assert body["data"]["workflow_id"] == wf_id
    assert body["data"]["version"] == "v1.0.0"

    pg = client.get("/api/workflows/playground")
    assert pg.status_code == 200
    apps = pg.get_json()["data"]
    assert any(a["workflow_id"] == wf_id for a in apps)
    assert any(a["current_version"] == "v1.0.0" for a in apps)


def test_publish_bumps_version(client):
    wf_id = f"wf_{uuid.uuid4().hex[:8]}"
    client.post(
        "/api/workflows/publish",
        json={"name": "v1", "workflow_id": wf_id, "graph_spec": VALID_GRAPH},
    )
    resp = client.post(
        "/api/workflows/publish",
        json={
            "name": "v2",
            "workflow_id": wf_id,
            "graph_spec": VALID_GRAPH,
            "version_info": {"is_major": False, "base_version": "v1.0.0"},
        },
    )
    assert resp.get_json()["data"]["version"] == "v1.1.0"


def test_publish_rejects_invalid_graph(client):
    bad = {
        "nodes": [{"id": "s", "type": "start", "position": {"x": 0, "y": 0}, "config": {}}],
        "edges": [],
    }
    resp = client.post(
        "/api/workflows/publish",
        json={"name": "bad", "graph_spec": bad},
    )
    assert resp.status_code == 409
    assert resp.get_json()["code"] == 1003


def test_save_and_load_draft(client):
    wf_id = f"wf_{uuid.uuid4().hex[:8]}"
    nodes = VALID_GRAPH["nodes"]
    edges = VALID_GRAPH["edges"]
    save = client.post(
        "/api/workflows",
        json={"workflow_id": wf_id, "name": "草稿", "nodes": nodes, "edges": edges},
    )
    assert save.status_code == 200

    load = client.get(f"/api/workflows/{wf_id}/draft")
    assert load.status_code == 200
    data = load.get_json()["data"]
    assert data["workflow_id"] == wf_id
    assert len(data["nodes"]) == 3
