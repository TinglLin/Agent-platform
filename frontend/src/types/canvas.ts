import type { Edge, Node } from "reactflow";

/** 节点 data.config，与后端 NODE_TYPE_MAP / PROTOCOL graph_spec 对齐 */
export interface NodeConfig {
  routes?: string[];
  model?: string;
  prompt?: string;
  question?: string;
  [key: string]: unknown;
}

export interface CanvasNodeData {
  label?: string;
  config: NodeConfig;
}

export type CanvasNode = Node<CanvasNodeData>;
export type CanvasEdge = Edge;

export interface GraphSpecNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  config: NodeConfig;
}

export interface GraphSpecEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
}

export interface GraphSpec {
  nodes: GraphSpecNode[];
  edges: GraphSpecEdge[];
}

export interface PlaygroundAppItem {
  workflow_id: string;
  name: string;
  description: string;
  current_version: string;
  icon: string;
  updated_at: string;
  version_count?: number;
  needs_update?: boolean;
}

/** 个人应用卡片 — 在 Playground 基础上扩展会话续跑字段（Demo） */
export interface UserAppItem extends PlaygroundAppItem {
  last_thread_id?: string | null;
  thread_status?: "running" | "waiting_human" | "completed" | "failed" | null;
}

export interface DraftWorkflow {
  workflow_id: string;
  name: string;
  description?: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface NodeTypeMeta {
  type: string;
  label: string;
  description: string;
}
