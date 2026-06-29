"""P4 SSE 对话 execute / resume 测试。"""

from __future__ import annotations

import json
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

HUMAN_GRAPH = {
    "nodes": [
        {"id": "s", "type": "start", "position": {"x": 0, "y": 0}, "config": {}},
        {
            "id": "h",
            "type": "human",
            "position": {"x": 100, "y": 0},
            "config": {"question": "请确认?"},
        },
        {"id": "e", "type": "end", "position": {"x": 200, "y": 0}, "config": {}},
    ],
    "edges": [
        {"id": "e1", "source": "s", "target": "h"},
        {"id": "e2", "source": "h", "target": "e"},
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


def _publish(client, wf_id: str, graph: dict):
    client.post(
        "/api/workflows/publish",
        json={"name": "chat-test", "workflow_id": wf_id, "graph_spec": graph},
    )


def _parse_sse(raw: str) -> list[dict]:
    events = []
    blocks = raw.strip().split("\n\n")
    for block in blocks:
        if not block.strip():
            continue
        lines = block.split("\n")
        event = next(l.split(": ", 1)[1] for l in lines if l.startswith("event: "))
        data = json.loads(next(l.split(": ", 1)[1] for l in lines if l.startswith("data: ")))
        events.append({"event": event, "data": data})
    return events


def test_execute_sse_done(client):
    wf_id = f"wf_{uuid.uuid4().hex[:8]}"
    _publish(client, wf_id, VALID_GRAPH)
    thread_id = str(uuid.uuid4())

    resp = client.post(
        "/api/chat/execute",
        json={"workflow_id": wf_id, "thread_id": thread_id, "input_text": "你好"},
        headers={"Accept": "text/event-stream"},
    )
    assert resp.status_code == 200
    assert resp.mimetype == "text/event-stream"
    events = _parse_sse(resp.data.decode("utf-8"))
    names = [e["event"] for e in events]
    assert "node_start" in names
    assert "llm_delta" in names
    assert "done" in names
    assert events[-1]["data"]["thread_id"] == thread_id


def test_execute_human_waiting_then_resume(client):
    wf_id = f"wf_{uuid.uuid4().hex[:8]}"
    _publish(client, wf_id, HUMAN_GRAPH)
    thread_id = str(uuid.uuid4())

    resp = client.post(
        "/api/chat/execute",
        json={"workflow_id": wf_id, "thread_id": thread_id, "input_text": "测试"},
        headers={"Accept": "text/event-stream"},
    )
    events = _parse_sse(resp.data.decode("utf-8"))
    waiting = next(e for e in events if e["event"] == "human_waiting")
    checkpoint_ns = waiting["data"]["checkpoint_ns"]

    resp2 = client.post(
        "/api/chat/resume",
        json={
            "thread_id": thread_id,
            "checkpoint_ns": checkpoint_ns,
            "user_input": {"confirmed": True, "comment": "同意"},
        },
        headers={"Accept": "text/event-stream"},
    )
    events2 = _parse_sse(resp2.data.decode("utf-8"))
    assert any(e["event"] == "done" for e in events2)
