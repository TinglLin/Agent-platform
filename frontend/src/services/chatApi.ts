export interface ChatSseEvent {
  event: string;
  data: Record<string, unknown>;
}

export interface HumanWaitingData {
  node_id: string;
  question: string;
  checkpoint_ns: string;
}

export interface ExecuteParams {
  workflow_id: string;
  thread_id: string;
  input_text: string;
}

export interface ResumeParams {
  thread_id: string;
  checkpoint_ns: string;
  user_input: { confirmed: boolean; comment?: string };
}

export interface ThreadStatus {
  thread_id: string;
  workflow_id: string;
  workflow_version: string;
  status: string;
  checkpoint_ns: string | null;
  pending_node_id: string | null;
  pending_question: string | null;
  final_output: string | null;
}

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function consumeSse(
  response: Response,
  onEvent: (evt: ChatSseEvent) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("无法读取 SSE 流");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      if (!part.trim()) continue;
      const lines = part.split("\n");
      let event = "message";
      let dataStr = "{}";
      for (const line of lines) {
        if (line.startsWith("event: ")) event = line.slice(7);
        if (line.startsWith("data: ")) dataStr = line.slice(6);
      }
      onEvent({ event, data: JSON.parse(dataStr) as Record<string, unknown> });
    }
  }
}

async function mockStream(
  events: ChatSseEvent[],
  onEvent: (evt: ChatSseEvent) => void,
): Promise<void> {
  for (const evt of events) {
    await new Promise((r) => setTimeout(r, 120));
    onEvent(evt);
  }
}

export async function streamExecute(
  params: ExecuteParams,
  onEvent: (evt: ChatSseEvent) => void,
): Promise<void> {
  if (USE_MOCK) {
    const { mockChatStreamEvents } = await import("@/mocks/chatStream");
    await mockStream(
      mockChatStreamEvents.map((e) => ({
        event: e.event,
        data: { ...e.data, thread_id: params.thread_id },
      })),
      onEvent,
    );
    return;
  }

  const res = await fetch(`${API_BASE}/api/chat/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(params),
  });

  if (!res.ok || !res.headers.get("content-type")?.includes("text/event-stream")) {
    const err = await res.json().catch(() => ({ msg: res.statusText }));
    throw new Error(err.msg ?? "对话请求失败");
  }

  await consumeSse(res, onEvent);
}

export async function streamResume(
  params: ResumeParams,
  onEvent: (evt: ChatSseEvent) => void,
): Promise<void> {
  if (USE_MOCK) {
    await mockStream(
      [
        { event: "node_start", data: { node_id: "node_end", node_type: "end" } },
        { event: "node_end", data: { node_id: "node_end", output: "已确认继续" } },
        {
          event: "done",
          data: { final_output: "已确认继续", thread_id: params.thread_id },
        },
      ],
      onEvent,
    );
    return;
  }

  const res = await fetch(`${API_BASE}/api/chat/resume`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(params),
  });

  if (!res.ok || !res.headers.get("content-type")?.includes("text/event-stream")) {
    const err = await res.json().catch(() => ({ msg: res.statusText }));
    throw new Error(err.msg ?? "续跑请求失败");
  }

  await consumeSse(res, onEvent);
}

export async function fetchThreadStatus(threadId: string): Promise<ThreadStatus> {
  if (USE_MOCK) {
    const { mockHumanWaitingEvent } = await import("@/mocks/chatStream");
    return {
      thread_id: threadId,
      workflow_id: "wf_demo",
      workflow_version: "v1.0.0",
      status: "waiting_human",
      checkpoint_ns: String(mockHumanWaitingEvent.data.checkpoint_ns),
      pending_node_id: String(mockHumanWaitingEvent.data.node_id),
      pending_question: String(mockHumanWaitingEvent.data.question),
      final_output: null,
    };
  }
  const res = await fetch(`${API_BASE}/api/chat/threads/${threadId}`);
  const body = await res.json();
  if (body.code !== 0) throw new Error(body.msg);
  return body.data as ThreadStatus;
}
