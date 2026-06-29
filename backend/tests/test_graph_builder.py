"""graph_builder 与 runner 引擎测试（P2）。"""

from __future__ import annotations

import sys
import tempfile
import uuid
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from core.checkpointer import init_checkpointer
from core.graph_builder import GraphValidationError, compile_graph, validate_graph
from core.runner import invoke_workflow, resume_workflow

SAMPLE_GRAPH = {
    "nodes": [
        {"id": "s", "type": "start", "position": {"x": 0, "y": 0}, "config": {}},
        {
            "id": "l",
            "type": "llm",
            "position": {"x": 100, "y": 0},
            "config": {"model": "gpt-4", "prompt": "你是助手"},
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
            "config": {"question": "确认?"},
        },
        {"id": "e", "type": "end", "position": {"x": 200, "y": 0}, "config": {}},
    ],
    "edges": [
        {"id": "e1", "source": "s", "target": "h"},
        {"id": "e2", "source": "h", "target": "e"},
    ],
}


@pytest.fixture()
def checkpointer_db(tmp_path):
    db = tmp_path / "test_ckpt.db"
    init_checkpointer(str(db))
    yield db


def test_validate_graph_rejects_missing_end():
    bad = {
        "nodes": [{"id": "s", "type": "start", "position": {"x": 0, "y": 0}, "config": {}}],
        "edges": [],
    }
    with pytest.raises(GraphValidationError) as exc:
        validate_graph(bad)
    assert any("end" in msg for msg in exc.value.errors)


def test_validate_graph_rejects_pure_cycle():
    cyclic = {
        "nodes": [
            {"id": "s", "type": "start", "position": {"x": 0, "y": 0}, "config": {}},
            {"id": "a", "type": "llm", "position": {"x": 0, "y": 0}, "config": {"model": "x", "prompt": "p"}},
            {"id": "e", "type": "end", "position": {"x": 0, "y": 0}, "config": {}},
        ],
        "edges": [
            {"id": "e1", "source": "s", "target": "a"},
            {"id": "e2", "source": "a", "target": "a"},
            {"id": "e3", "source": "a", "target": "e"},
        ],
    }
    with pytest.raises(GraphValidationError) as exc:
        validate_graph(cyclic)
    assert any("纯循环" in msg for msg in exc.value.errors)


def test_compile_and_invoke_llm_graph(checkpointer_db):
    validate_graph(SAMPLE_GRAPH)
    graph = compile_graph(SAMPLE_GRAPH)
    thread_id = str(uuid.uuid4())
    result = graph.invoke(
        {
            "workflow_id": "wf_test",
            "workflow_version": "v1.0.0",
            "thread_id": thread_id,
            "input_text": "你好",
            "messages": [],
            "session_status": "running",
            "node_outputs": {},
        },
        {"configurable": {"thread_id": thread_id}},
    )
    assert result.get("session_status") == "completed"
    assert result.get("final_output")


def test_human_interrupt_and_resume(checkpointer_db):
    validate_graph(HUMAN_GRAPH)
    thread_id = str(uuid.uuid4())

    interrupted = invoke_workflow(
        HUMAN_GRAPH,
        thread_id=thread_id,
        workflow_id="wf_h",
        workflow_version="v1.0.0",
        input_text="测试",
    )
    assert interrupted.get("__interrupt__")

    resumed = resume_workflow(
        HUMAN_GRAPH,
        thread_id=thread_id,
        resume_payload={"confirmed": True, "comment": "同意"},
    )
    assert resumed.get("session_status") == "completed"
