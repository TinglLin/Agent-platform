"""SSE 对话路由 — execute / resume（PROTOCOL.md §3 / §4）。"""

from __future__ import annotations

import json

from flask import Blueprint, Response, request
from pydantic import ValidationError

from api.response import fail, success
from core.runner import stream_execute, stream_resume
from repositories.db import SessionLocal
from repositories.session_repo import SessionRepository
from repositories.workflow_repo import WorkflowRepository
from schemas.chat import ExecuteRequest, ResumeRequest

chat_bp = Blueprint("chat", __name__, url_prefix="/api/chat")

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


def _format_sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _sse_response(event_iter):
    def generate():
        for evt in event_iter:
            yield _format_sse(evt["event"], evt["data"])

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers=SSE_HEADERS,
    )


@chat_bp.post("/execute")
def chat_execute():
    body = request.get_json(silent=True)
    if not body:
        return fail(1001, "请求体不能为空")

    try:
        payload = ExecuteRequest.model_validate(body)
    except ValidationError as exc:
        return fail(1001, str(exc.errors()[0]["msg"]))

    def event_source():
        session = SessionLocal()
        try:
            yield from stream_execute(
                workflow_repo=WorkflowRepository(session),
                session_repo=SessionRepository(session),
                workflow_id=payload.workflow_id,
                thread_id=payload.thread_id,
                input_text=payload.input_text,
            )
        finally:
            session.close()

    return _sse_response(event_source())


@chat_bp.post("/resume")
def chat_resume():
    body = request.get_json(silent=True)
    if not body:
        return fail(1001, "请求体不能为空")

    try:
        payload = ResumeRequest.model_validate(body)
    except ValidationError as exc:
        return fail(1001, str(exc.errors()[0]["msg"]))

    def event_source():
        session = SessionLocal()
        try:
            yield from stream_resume(
                workflow_repo=WorkflowRepository(session),
                session_repo=SessionRepository(session),
                thread_id=payload.thread_id,
                checkpoint_ns=payload.checkpoint_ns,
                user_input=payload.user_input.model_dump(),
            )
        finally:
            session.close()

    return _sse_response(event_source())


@chat_bp.get("/threads/<thread_id>")
def get_thread_status(thread_id: str):
    """读取 thread 状态，供「继续会话」恢复人工等待 UI。"""
    session = SessionLocal()
    try:
        thread = SessionRepository(session).get_thread(thread_id)
    finally:
        session.close()

    if thread is None:
        return fail(1002, "会话不存在")

    return success(
        {
            "thread_id": thread.thread_id,
            "workflow_id": thread.workflow_id,
            "workflow_version": thread.workflow_version,
            "status": thread.status,
            "checkpoint_ns": thread.checkpoint_ns,
            "pending_node_id": thread.pending_node_id,
            "pending_question": thread.pending_question,
            "final_output": thread.final_output,
        },
        msg="ok",
    )
