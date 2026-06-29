"""RAG 检索节点：Demo 阶段 Mock 检索上下文。"""

from __future__ import annotations

from typing import Any

from core.state import WorkflowState
from nodes.base import BaseNode


class RagNode(BaseNode):
    """RAG 节点：根据 input_text 写入 rag_context，供下游 LLM 读取。"""

    def execute(self, state: WorkflowState, config: dict[str, Any]) -> dict[str, Any]:
        cfg = self.parse_config(config)
        node_id = self.node_id(config)
        top_k = cfg.get("top_k", 3)
        query = state.get("input_text") or ""
        context = f"[Demo RAG top_k={top_k}] 与「{query}」相关的知识库片段"
        return {
            "rag_context": context,
            "node_outputs": {node_id: context},
        }
