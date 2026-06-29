"""节点类型注册表 — NODE_TYPE_MAP 与 GET /api/node-types 数据源。"""

from __future__ import annotations

from nodes.base import BaseNode
from nodes.end_node import EndNode
from nodes.human_node import HumanNode
from nodes.llm_node import LlmNode
from nodes.memory_node import MemoryNode
from nodes.rag_node import RagNode
from nodes.router_node import RouterNode
from nodes.start_node import StartNode

NODE_TYPE_MAP: dict[str, type[BaseNode]] = {
    "start": StartNode,
    "end": EndNode,
    "llm": LlmNode,
    "rag": RagNode,
    "human": HumanNode,
    "router": RouterNode,
    "memory": MemoryNode,
}


def list_node_types() -> list[dict[str, str]]:
    labels = {
        "start": "开始",
        "end": "结束",
        "llm": "AI 对话",
        "rag": "RAG 检索",
        "human": "人工介入",
        "router": "路由分支",
        "memory": "记忆",
    }
    return [{"type": k, "label": labels.get(k, k)} for k in NODE_TYPE_MAP]
