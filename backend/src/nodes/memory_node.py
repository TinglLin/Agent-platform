"""记忆节点占位：P4+ 可扩展长期记忆读写。"""

from __future__ import annotations

from typing import Any

from core.state import WorkflowState
from nodes.base import BaseNode


class MemoryNode(BaseNode):
    """记忆节点占位：Demo 阶段透传 state，不写额外字段。"""

    def execute(self, state: WorkflowState, config: dict[str, Any]) -> dict[str, Any]:
        node_id = self.node_id(config)
        return {"node_outputs": {node_id: {"status": "memory_placeholder"}}}
