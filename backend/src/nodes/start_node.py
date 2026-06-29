"""开始节点：注入用户 input_text 到 messages。"""

from __future__ import annotations

from typing import Any

from langchain_core.messages import HumanMessage

from core.state import WorkflowState
from nodes.base import BaseNode


class StartNode(BaseNode):
    """开始节点：将本轮 input_text 写入 messages，标记 session 为 running。"""

    def execute(self, state: WorkflowState, config: dict[str, Any]) -> dict[str, Any]:
        updates: dict[str, Any] = {"session_status": "running"}
        text = state.get("input_text") or ""
        if text:
            updates["messages"] = [HumanMessage(content=text)]
        return updates
