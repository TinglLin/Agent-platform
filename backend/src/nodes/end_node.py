"""结束节点：汇总 final_output 并标记 completed。"""

from __future__ import annotations

from typing import Any

from core.state import WorkflowState
from nodes.base import BaseNode


class EndNode(BaseNode):
    """结束节点：写入 final_output 与 session_status=completed。"""

    def execute(self, state: WorkflowState, config: dict[str, Any]) -> dict[str, Any]:
        final = state.get("input_text") or ""
        messages = state.get("messages") or []
        if messages:
            last = messages[-1]
            content = getattr(last, "content", None)
            if content:
                final = str(content)

        node_id = self.node_id(config)
        return {
            "session_status": "completed",
            "final_output": final,
            "node_outputs": {node_id: final},
        }
