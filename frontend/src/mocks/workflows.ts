import type { NodeTypeMeta, PlaygroundAppItem, DraftWorkflow, UserAppItem } from "@/types/canvas";
import type { CanvasEdge, CanvasNode } from "@/types/canvas";

export const mockNodeTypes: NodeTypeMeta[] = [
  { type: "start", label: "开始", description: "单入口" },
  { type: "end", label: "结束", description: "单出口" },
  { type: "llm", label: "AI 对话", description: "LLM 推理" },
  { type: "rag", label: "RAG 检索", description: "知识库检索" },
  { type: "human", label: "人工介入", description: "interrupt 断点" },
  { type: "router", label: "路由分支", description: "条件分支收敛点" },
];

export const mockPlaygroundApps: PlaygroundAppItem[] = [
  {
    workflow_id: "wf_demo",
    name: "智能客服助手",
    description: "包含 RAG 和人工介入的客服 Demo",
    current_version: "v1.2.0",
    icon: "🤖",
    updated_at: "2026-06-29",
  },
  {
    workflow_id: "wf_rag",
    name: "知识库问答",
    description: "RAG + LLM 文档问答",
    current_version: "v2.0.0",
    icon: "📚",
    updated_at: "2026-06-28",
  },
];

export const mockUserApps: UserAppItem[] = mockPlaygroundApps.map((app, i) => ({
  ...app,
  last_thread_id: i === 0 ? "mock-thread-001" : null,
  thread_status: i === 0 ? ("waiting_human" as const) : null,
}));

const demoNodes: CanvasNode[] = [
  {
    id: "node_start",
    type: "start",
    position: { x: 80, y: 200 },
    data: { label: "开始", config: {} },
  },
  {
    id: "node_rag",
    type: "rag",
    position: { x: 280, y: 200 },
    data: { label: "RAG", config: { top_k: 3 } },
  },
  {
    id: "node_llm",
    type: "llm",
    position: { x: 480, y: 200 },
    data: {
      label: "LLM",
      config: { model: "gpt-4", prompt: "你是客服助手，结合检索上下文回答" },
    },
  },
  {
    id: "node_human",
    type: "human",
    position: { x: 680, y: 200 },
    data: { label: "人工确认", config: { question: "请确认是否执行?" } },
  },
  {
    id: "node_end",
    type: "end",
    position: { x: 880, y: 200 },
    data: { label: "结束", config: {} },
  },
];

const demoEdges: CanvasEdge[] = [
  { id: "e1", source: "node_start", target: "node_rag" },
  { id: "e2", source: "node_rag", target: "node_llm" },
  { id: "e3", source: "node_llm", target: "node_human" },
  { id: "e4", source: "node_human", target: "node_end" },
];

export const mockDraftWorkflows: Record<string, DraftWorkflow> = {
  wf_demo: {
    workflow_id: "wf_demo",
    name: "智能客服助手",
    description: "包含 RAG 和人工介入",
    nodes: demoNodes,
    edges: demoEdges,
  },
  wf_rag: {
    workflow_id: "wf_rag",
    name: "知识库问答",
    nodes: [
      {
        id: "s1",
        type: "start",
        position: { x: 100, y: 160 },
        data: { label: "开始", config: {} },
      },
      {
        id: "r1",
        type: "rag",
        position: { x: 300, y: 160 },
        data: { label: "RAG", config: { top_k: 5 } },
      },
      {
        id: "l1",
        type: "llm",
        position: { x: 500, y: 160 },
        data: { label: "LLM", config: { model: "gpt-4", prompt: "基于上下文回答" } },
      },
      {
        id: "e1",
        type: "end",
        position: { x: 700, y: 160 },
        data: { label: "结束", config: {} },
      },
    ],
    edges: [
      { id: "edge1", source: "s1", target: "r1" },
      { id: "edge2", source: "r1", target: "l1" },
      { id: "edge3", source: "l1", target: "e1" },
    ],
  },
};

export function createEmptyDraft(workflowId: string): DraftWorkflow {
  return {
    workflow_id: workflowId,
    name: "未命名应用",
    nodes: [
      {
        id: "node_start",
        type: "start",
        position: { x: 120, y: 200 },
        data: { label: "开始", config: {} },
      },
      {
        id: "node_end",
        type: "end",
        position: { x: 420, y: 200 },
        data: { label: "结束", config: {} },
      },
    ],
    edges: [],
  };
}
