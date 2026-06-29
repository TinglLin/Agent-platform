"""LangGraph 执行门面：stream_execute / stream_resume 产出 SSE 事件。"""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

from langgraph.types import Command

from core.graph_builder import GraphValidationError, compile_graph
from core.state import build_initial_state
from repositories.session_repo import SessionRepository
from repositories.workflow_repo import WorkflowNotFoundError, WorkflowRepository

SseEvent = dict[str, Any]


def _run_config(thread_id: str, checkpoint_ns: str | None = None) -> dict[str, Any]:
    configurable: dict[str, Any] = {"thread_id": thread_id}
    if checkpoint_ns:
        configurable["checkpoint_ns"] = checkpoint_ns
    return {"configurable": configurable}


def _node_type_map(graph_spec: dict[str, Any]) -> dict[str, str]:
    return {n["id"]: n["type"] for n in graph_spec.get("nodes", [])}


def _chunk_text(text: str, size: int = 12) -> list[str]:
    if not text:
        return [""]
    return [text[i : i + size] for i in range(0, len(text), size)]


def _extract_output(node_id: str, node_type: str, update: dict[str, Any]) -> str:
    outputs = update.get("node_outputs") or {}
    if node_id in outputs:
        val = outputs[node_id]
        return val if isinstance(val, str) else json.dumps(val, ensure_ascii=False)
    if node_type == "end":
        return str(update.get("final_output") or "")
    return ""


def _emit_node_lifecycle(
    node_id: str,
    node_type: str,
    update: dict[str, Any],
) -> Iterator[SseEvent]:
    yield {"event": "node_start", "data": {"node_id": node_id, "node_type": node_type}}

    output = _extract_output(node_id, node_type, update)
    if node_type == "llm" and output:
        for piece in _chunk_text(output):
            yield {"event": "llm_delta", "data": {"content": piece, "node_id": node_id}}

    yield {"event": "node_end", "data": {"node_id": node_id, "output": output}}


def _emit_interrupt(
    graph,
    run_config: dict[str, Any],
    interrupts: tuple[Any, ...] | list[Any],
    session_repo: SessionRepository,
    thread_id: str,
    workflow_id: str | None = None,
) -> Iterator[SseEvent]:
    snapshot = graph.get_state(run_config)
    checkpoint_ns = snapshot.config.get("configurable", {}).get("checkpoint_ns", "")

    intr = interrupts[0] if interrupts else None
    value = getattr(intr, "value", intr) if intr is not None else {}
    if not isinstance(value, dict):
        value = {"question": str(value) if value is not None else "请确认"}

    node_id = str(value.get("node_id") or "")
    question = str(value.get("question") or "请确认是否继续?")

    session_repo.update_thread(
        thread_id,
        status="waiting_human",
        checkpoint_ns=checkpoint_ns,
        pending_node_id=node_id,
        pending_question=question,
    )
    session_repo.add_message(
        thread_id=thread_id,
        role="human_waiting",
        content=question,
        node_id=node_id,
    )
    if workflow_id:
        session_repo.touch_user_app(workflow_id, thread_id)

    yield {
        "event": "human_waiting",
        "data": {
            "node_id": node_id,
            "question": question,
            "checkpoint_ns": checkpoint_ns,
        },
    }


def _stream_graph(
    graph,
    run_input: Any,
    run_config: dict[str, Any],
    node_types: dict[str, str],
    session_repo: SessionRepository,
    thread_id: str,
    workflow_id: str | None = None,
) -> Iterator[SseEvent]:
    for chunk in graph.stream(run_input, run_config, stream_mode="updates"):
        if not isinstance(chunk, dict):
            continue

        if "__interrupt__" in chunk:
            yield from _emit_interrupt(
                graph, run_config, chunk["__interrupt__"], session_repo, thread_id, workflow_id
            )
            return

        for node_id, update in chunk.items():
            if node_id.startswith("__") or not isinstance(update, dict):
                continue
            node_type = node_types.get(node_id, "unknown")
            yield from _emit_node_lifecycle(node_id, node_type, update)

    snapshot = graph.get_state(run_config)
    if snapshot.interrupts:
        yield from _emit_interrupt(
            graph, run_config, snapshot.interrupts, session_repo, thread_id, workflow_id
        )
        return

    values = snapshot.values if isinstance(snapshot.values, dict) else {}
    final_output = str(values.get("final_output") or "")
    session_repo.update_thread(
        thread_id,
        status="completed",
        final_output=final_output,
        clear_pending=True,
    )
    if values.get("input_text"):
        session_repo.add_message(
            thread_id=thread_id, role="user", content=str(values.get("input_text"))
        )
    if final_output:
        session_repo.add_message(thread_id=thread_id, role="assistant", content=final_output)
    if workflow_id:
        session_repo.touch_user_app(workflow_id, thread_id)

    yield {"event": "done", "data": {"final_output": final_output, "thread_id": thread_id}}


def stream_execute(
    *,
    workflow_repo: WorkflowRepository,
    session_repo: SessionRepository,
    workflow_id: str,
    thread_id: str,
    input_text: str,
) -> Iterator[SseEvent]:
    """POST /api/chat/execute — 从入口运行工作流并 yield SSE 事件。"""
    workflow = workflow_repo.get_workflow(workflow_id)
    if workflow is None or not workflow.current_version:
        yield {"event": "error", "data": {"msg": f"工作流 {workflow_id} 未发布"}}
        return

    try:
        graph_spec = workflow_repo.get_published_graph_spec(workflow_id)
        session_repo.ensure_thread_for_execute(
            thread_id=thread_id,
            workflow_id=workflow_id,
            workflow_version=workflow.current_version,
        )
    except Exception as exc:
        yield {"event": "error", "data": {"msg": str(exc)}}
        return

    graph = compile_graph(graph_spec)
    run_config = _run_config(thread_id)
    initial = build_initial_state(
        workflow_id=workflow_id,
        workflow_version=workflow.current_version,
        thread_id=thread_id,
        input_text=input_text,
    )
    node_types = _node_type_map(graph_spec)

    session_repo.add_message(thread_id=thread_id, role="user", content=input_text)

    try:
        yield from _stream_graph(
            graph, initial, run_config, node_types, session_repo, thread_id, workflow_id
        )
    except GraphValidationError as exc:
        yield {"event": "error", "data": {"msg": exc.errors[0] if exc.errors else str(exc)}}
    except Exception as exc:
        session_repo.update_thread(thread_id, status="failed")
        yield {"event": "error", "data": {"msg": f"LangGraph 执行失败：{exc}"}}


def stream_resume(
    *,
    workflow_repo: WorkflowRepository,
    session_repo: SessionRepository,
    thread_id: str,
    checkpoint_ns: str,
    user_input: dict[str, Any],
) -> Iterator[SseEvent]:
    """POST /api/chat/resume — 从 interrupt 断点续跑。"""
    try:
        thread = session_repo.get_thread_for_resume(thread_id)
        graph_spec = workflow_repo.get_published_graph_spec(
            thread.workflow_id, thread.workflow_version
        )
    except WorkflowNotFoundError as exc:
        yield {"event": "error", "data": {"msg": str(exc)}}
        return
    except Exception as exc:
        yield {"event": "error", "data": {"msg": str(exc)}}
        return

    graph = compile_graph(graph_spec)
    run_config = _run_config(thread_id, checkpoint_ns)
    node_types = _node_type_map(graph_spec)

    session_repo.update_thread(thread_id, status="running", clear_pending=True)

    try:
        yield from _stream_graph(
            graph,
            Command(resume=user_input),
            run_config,
            node_types,
            session_repo,
            thread_id,
            thread.workflow_id,
        )
    except Exception as exc:
        session_repo.update_thread(thread_id, status="failed")
        yield {"event": "error", "data": {"msg": f"LangGraph 续跑失败：{exc}"}}


# 保留 P2 同步接口供测试
def compile_workflow(graph_spec: dict[str, Any]):
    return compile_graph(graph_spec)


def invoke_workflow(
    graph_spec: dict[str, Any],
    *,
    thread_id: str,
    workflow_id: str,
    workflow_version: str,
    input_text: str,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    graph = compile_workflow(graph_spec)
    run_config = {"configurable": {"thread_id": thread_id}, **(config or {})}
    initial = build_initial_state(
        workflow_id=workflow_id,
        workflow_version=workflow_version,
        thread_id=thread_id,
        input_text=input_text,
    )
    return graph.invoke(initial, run_config)


def resume_workflow(
    graph_spec: dict[str, Any],
    *,
    thread_id: str,
    resume_payload: Any,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    graph = compile_workflow(graph_spec)
    run_config = {"configurable": {"thread_id": thread_id}, **(config or {})}
    return graph.invoke(Command(resume=resume_payload), run_config)
