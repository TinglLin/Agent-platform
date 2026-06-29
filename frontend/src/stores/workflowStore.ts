import { create } from "zustand";
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "reactflow";
import type { CanvasEdge, CanvasNode } from "@/types/canvas";
import { toGraphSpec } from "@/utils/graphSpec";
import { validateCanvasGraph } from "@/utils/validateCanvasGraph";
import * as workflowApi from "@/services/workflowApi";

interface WorkflowStore {
  workflowId: string | null;
  workflowName: string;
  description: string;
  version: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  validationErrors: string[];
  validationWarnings: string[];
  isGraphValid: boolean;
  isSaving: boolean;
  isPublishing: boolean;

  loadDraft: (workflowId: string) => Promise<void>;
  resetCanvas: (workflowId: string, name?: string) => void;
  setWorkflowMeta: (name: string, description?: string) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (type: string, position: { x: number; y: number }) => void;
  updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void;
  runValidation: () => void;
  saveDraft: () => Promise<void>;
  publish: (isMajor?: boolean) => Promise<{ workflow_id: string; version: string }>;
}

const defaultConfigForType = (type: string): Record<string, unknown> => {
  switch (type) {
    case "llm":
      return { model: "deepseek-v4-pro", prompt: "" };
    case "rag":
      return { top_k: 3 };
    case "human":
      return { question: "请确认是否继续?" };
    case "router":
      return { routes: ["approved", "rejected"] };
    default:
      return {};
  }
};

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  workflowId: null,
  workflowName: "未命名应用",
  description: "",
  version: "v1.0.0",
  nodes: [],
  edges: [],
  validationErrors: [],
  validationWarnings: [],
  isGraphValid: false,
  isSaving: false,
  isPublishing: false,

  loadDraft: async (workflowId) => {
    const draft = await workflowApi.fetchDraft(workflowId);
    set({
      workflowId: draft.workflow_id,
      workflowName: draft.name,
      description: draft.description ?? "",
      nodes: draft.nodes,
      edges: draft.edges,
    });
    get().runValidation();
  },

  resetCanvas: (workflowId, name = "未命名应用") => {
    set({
      workflowId,
      workflowName: name,
      description: "",
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
    });
    get().runValidation();
  },

  setWorkflowMeta: (name, description) => {
    set({ workflowName: name, ...(description != null ? { description } : {}) });
  },

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },

  onConnect: (connection) => {
    const id = `e_${crypto.randomUUID().slice(0, 8)}`;
    set({
      edges: [
        ...get().edges,
        {
          id,
          source: connection.source!,
          target: connection.target!,
          sourceHandle: connection.sourceHandle,
          targetHandle: connection.targetHandle,
        },
      ],
    });
  },

  addNode: (type, position) => {
    const id = `${type}_${crypto.randomUUID().slice(0, 8)}`;
    const labels: Record<string, string> = {
      start: "开始",
      end: "结束",
      llm: "LLM",
      rag: "RAG",
      human: "人工",
      router: "路由",
    };
    set({
      nodes: [
        ...get().nodes,
        {
          id,
          type,
          position,
          data: { label: labels[type] ?? type, config: defaultConfigForType(type) },
        },
      ],
    });
  },

  updateNodeConfig: (nodeId, config) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, config: { ...n.data.config, ...config } } } : n,
      ),
    });
    get().runValidation();
  },

  runValidation: () => {
    const { nodes, edges } = get();
    const result = validateCanvasGraph(nodes, edges);
    set({
      validationErrors: result.errors,
      validationWarnings: result.warnings,
      isGraphValid: result.valid,
    });
  },

  saveDraft: async () => {
    const { workflowId, workflowName, nodes, edges } = get();
    if (!workflowId) throw new Error("缺少 workflowId");
    set({ isSaving: true });
    try {
      await workflowApi.saveDraft({ workflow_id: workflowId, name: workflowName, nodes, edges });
    } finally {
      set({ isSaving: false });
    }
  },

  publish: async (isMajor = false) => {
    get().runValidation();
    const state = get();
    if (!state.isGraphValid) {
      throw new Error(state.validationErrors[0] ?? "图校验未通过");
    }
    if (!state.workflowId) throw new Error("缺少 workflowId");
    set({ isPublishing: true });
    try {
      const result = await workflowApi.publishWorkflow({
        workflow_id: state.workflowId,
        name: state.workflowName,
        description: state.description,
        graph_spec: toGraphSpec(state.nodes, state.edges),
        version_info: { is_major: isMajor, base_version: state.version },
      });
      set({ version: result.version });
      return result;
    } finally {
      set({ isPublishing: false });
    }
  },
}));
