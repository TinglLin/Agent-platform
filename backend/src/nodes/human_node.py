"""人工介入节点：LangGraph interrupt 挂起，等待 resume。"""

from __future__ import annotations

from typing import Any

from langgraph.types import interrupt

from core.state import WorkflowState
from nodes.base import BaseNode


class HumanNode(BaseNode):
    """
    人工节点：interrupt 挂起并写入 pending_human；
    resume 后 interrupt 返回 user_input，写入 human_response / user_confirm。
    """

    def execute(self, state: WorkflowState, config: dict[str, Any]) -> dict[str, Any]:
        cfg = self.parse_config(config)
        node_id = self.node_id(config)
        question = str(cfg.get("question") or "请确认是否继续?")

        resume_payload = interrupt(
            {
                "node_id": node_id,
                "question": question,
            }
        )

        confirmed = True
        comment = ""
        if isinstance(resume_payload, dict):
            confirmed = bool(resume_payload.get("confirmed", True))
            comment = str(resume_payload.get("comment") or "")
        elif resume_payload is not None:
            comment = str(resume_payload)

        return {
            "session_status": "running",
            "pending_human": None,
            "human_response": comment,
            "user_confirm": confirmed,
            "node_outputs": {node_id: {"confirmed": confirmed, "comment": comment}},
        }
