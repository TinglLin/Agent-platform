"""路由节点：唯一分支收敛点，写 next_node_id 供 conditional_edges 读取。"""

from __future__ import annotations

from typing import Any

from core.state import WorkflowState
from nodes.base import BaseNode


class RouterNode(BaseNode):
    """
    路由节点：不执行业务，仅根据 State 选择 config.routes 中的一项写入 next_node_id。
    Demo 规则：user_confirm=False 时走第二路由，否则走第一路由。
    """

    def execute(self, state: WorkflowState, config: dict[str, Any]) -> dict[str, Any]:
        cfg = self.parse_config(config)
        routes = list(cfg.get("routes") or ["default"])
        if not routes:
            routes = ["default"]

        if state.get("user_confirm") is False and len(routes) > 1:
            chosen = routes[1]
        else:
            chosen = routes[0]

        node_id = self.node_id(config)
        return {
            "next_node_id": chosen,
            "node_outputs": {node_id: {"route": chosen}},
        }
