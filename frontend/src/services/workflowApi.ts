import type { ApiResponse, PublishResult, SaveDraftPayload } from "@/types/api";
import type { DraftWorkflow, PlaygroundAppItem } from "@/types/canvas";
import {
  createEmptyDraft,
  mockDraftWorkflows,
  mockPlaygroundApps,
} from "@/mocks/workflows";

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  return res.json() as Promise<ApiResponse<T>>;
}

export async function fetchPlaygroundApps(): Promise<PlaygroundAppItem[]> {
  if (USE_MOCK) {
    await delay(200);
    return mockPlaygroundApps;
  }
  const res = await request<PlaygroundAppItem[]>("/api/workflows/playground");
  if (res.code !== 0) throw new Error(res.msg);
  return res.data;
}

export async function fetchDrafts(): Promise<PlaygroundAppItem[]> {
  const res = await request<PlaygroundAppItem[]>("/api/workflows/drafts");
  if (res.code !== 0) throw new Error(res.msg);
  return res.data;
}

export async function fetchDraft(workflowId: string): Promise<DraftWorkflow> {
  if (USE_MOCK) {
    await delay(150);
    return mockDraftWorkflows[workflowId] ?? createEmptyDraft(workflowId);
  }
  const res = await request<DraftWorkflow>(`/api/workflows/${workflowId}/draft`);
  if (res.code !== 0) throw new Error(res.msg);
  return res.data;
}

export async function saveDraft(payload: SaveDraftPayload): Promise<void> {
  if (USE_MOCK) {
    await delay(300);
    mockDraftWorkflows[payload.workflow_id] = {
      workflow_id: payload.workflow_id,
      name: payload.name,
      nodes: payload.nodes,
      edges: payload.edges,
    };
    return;
  }
  const res = await request<unknown>("/api/workflows", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (res.code !== 0) throw new Error(res.msg);
}

export async function fetchUserApps(): Promise<import("@/types/canvas").UserAppItem[]> {
  if (USE_MOCK) {
    await delay(200);
    const { mockUserApps } = await import("@/mocks/workflows");
    return mockUserApps;
  }
  const res = await request<import("@/types/canvas").UserAppItem[]>("/api/users/apps");
  if (res.code !== 0) throw new Error(res.msg);
  return res.data;
}

export async function publishWorkflow(payload: {
  workflow_id?: string;
  name: string;
  description?: string;
  graph_spec: ReturnType<typeof import("@/utils/graphSpec").toGraphSpec>;
  version_info?: { is_major: boolean; base_version?: string };
}): Promise<PublishResult> {
  if (USE_MOCK) {
    await delay(400);
    return { workflow_id: "wf_mock_new", version: "v1.0.0" };
  }
  const res = await request<PublishResult>("/api/workflows/publish", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (res.code !== 0) throw new Error(res.msg);
  return res.data;
}

export async function addToMyApps(workflowId: string): Promise<void> {
  const res = await request<unknown>("/api/users/apps", {
    method: "POST",
    body: JSON.stringify({ workflow_id: workflowId }),
  });
  if (res.code !== 0) throw new Error(res.msg);
}

export async function removeFromMyApps(workflowId: string): Promise<void> {
  const res = await request<unknown>(`/api/users/apps/${workflowId}`, {
    method: "DELETE",
  });
  if (res.code !== 0) throw new Error(res.msg);
}

export async function withdrawWorkflow(workflowId: string): Promise<void> {
  const res = await request<unknown>(`/api/workflows/${workflowId}/withdraw`, {
    method: "POST",
  });
  if (res.code !== 0) throw new Error(res.msg);
}

export async function revertDraft(workflowId: string): Promise<void> {
  const res = await request<unknown>(`/api/workflows/${workflowId}/revert-draft`, {
    method: "POST",
  });
  if (res.code !== 0) throw new Error(res.msg);
}

export async function deleteWorkflow(workflowId: string): Promise<void> {
  const res = await request<unknown>(`/api/workflows/${workflowId}`, {
    method: "DELETE",
  });
  if (res.code !== 0) throw new Error(res.msg);
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
