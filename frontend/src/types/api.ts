import type { CanvasEdge, CanvasNode } from "@/types/canvas";

export interface ApiResponse<T> {
  code: number;
  data: T;
  msg: string;
}

export interface PublishResult {
  workflow_id: string;
  version: string;
}

export interface SaveDraftPayload {
  workflow_id: string;
  name: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}
