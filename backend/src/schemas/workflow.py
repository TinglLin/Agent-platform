"""工作流 API Pydantic 模型（PROTOCOL.md §1 / §5）。"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class GraphSpecNode(BaseModel):
    id: str
    type: str
    position: dict[str, float]
    config: dict[str, Any] = Field(default_factory=dict)


class GraphSpecEdge(BaseModel):
    id: str
    source: str
    target: str
    sourceHandle: Optional[str] = None


class GraphSpec(BaseModel):
    nodes: list[GraphSpecNode]
    edges: list[GraphSpecEdge]

    def to_canvas_dict(self) -> dict[str, Any]:
        return {
            "nodes": [n.model_dump() for n in self.nodes],
            "edges": [e.model_dump(exclude_none=True) for e in self.edges],
        }


class VersionInfo(BaseModel):
    is_major: bool = False
    base_version: Optional[str] = None


class PublishRequest(BaseModel):
    name: str
    description: Optional[str] = None
    graph_spec: GraphSpec
    version_info: Optional[VersionInfo] = None
    workflow_id: Optional[str] = None
    icon: Optional[str] = "🤖"


class PublishResponse(BaseModel):
    workflow_id: str
    version: str


class SaveDraftRequest(BaseModel):
    workflow_id: str
    name: str
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]


class PlaygroundItem(BaseModel):
    workflow_id: str
    name: str
    description: Optional[str] = None
    current_version: str
    icon: str = "🤖"
    updated_at: str
