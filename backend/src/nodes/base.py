"""节点抽象基类：graph_builder 统一调用 execute(state, config)。"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from core.state import WorkflowState


class BaseNode(ABC):
    @abstractmethod
    def execute(self, state: WorkflowState, config: dict[str, Any]) -> dict[str, Any]:
        """读取 state 与节点 config，返回需合并进 WorkflowState 的局部更新。"""

    def node_id(self, config: dict[str, Any]) -> str:
        return str(config.get("_node_id", "unknown"))

    def parse_config(self, config: dict[str, Any]) -> dict[str, Any]:
        return {k: v for k, v in config.items() if not str(k).startswith("_")}
