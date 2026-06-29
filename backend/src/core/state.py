"""LangGraph 全局 State Schema（IMPLEMENTATION_PLAN §3）。"""

from __future__ import annotations

from typing import Annotated, Any, Literal, Optional

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict

SessionStatus = Literal["running", "waiting_human", "completed", "failed"]


class PendingHuman(TypedDict, total=False):
    node_id: str
    question: str


def merge_node_outputs(left: dict[str, Any] | None, right: dict[str, Any] | None) -> dict[str, Any]:
    """按 node_id 合并各节点产出，供 Router 读取。"""
    merged = dict(left or {})
    merged.update(right or {})
    return merged


class WorkflowState(TypedDict, total=False):
    workflow_id: str
    workflow_version: str
    thread_id: str

    messages: Annotated[list[BaseMessage], add_messages]
    input_text: str

    # checkpoint_ns 由 LangGraph configurable 管理（reserved channel），runner 经 get_state() 读取

    session_status: SessionStatus
    pending_human: Optional[PendingHuman]
    human_response: Optional[str]
    user_confirm: Optional[bool]

    current_node_id: Optional[str]
    next_node_id: Optional[str]
    node_outputs: Annotated[dict[str, Any], merge_node_outputs]

    rag_context: Optional[str]
    final_output: Optional[str]

    error: Optional[str]


def build_initial_state(
    *,
    workflow_id: str,
    workflow_version: str,
    thread_id: str,
    input_text: str = "",
) -> WorkflowState:
    """runner 每次 execute 注入的初始 State 快照。"""
    return {
        "workflow_id": workflow_id,
        "workflow_version": workflow_version,
        "thread_id": thread_id,
        "messages": [],
        "input_text": input_text,
        "session_status": "running",
        "pending_human": None,
        "human_response": None,
        "user_confirm": None,
        "current_node_id": None,
        "next_node_id": None,
        "node_outputs": {},
        "rag_context": None,
        "final_output": None,
        "error": None,
    }
