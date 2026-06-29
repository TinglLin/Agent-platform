import { create } from "zustand";
import type { HumanWaitingData } from "@/services/chatApi";
import * as chatApi from "@/services/chatApi";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "human_waiting";
  content: string;
  streaming?: boolean;
}

interface ChatStore {
  workflowId: string | null;
  workflowName: string;
  threadId: string | null;
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  humanWaiting: HumanWaitingData | null;

  startNewSession: (workflowId: string, workflowName: string, threadId?: string) => void;
  hydrateFromThread: (threadId: string) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  confirmHuman: (confirmed: boolean, comment?: string) => Promise<void>;
  reset: () => void;
}

let assistantMsgId: string | null = null;

export const useChatStore = create<ChatStore>((set, get) => ({
  workflowId: null,
  workflowName: "",
  threadId: null,
  messages: [],
  streamingText: "",
  isStreaming: false,
  humanWaiting: null,

  startNewSession: (workflowId, workflowName, threadId) => {
    set({
      workflowId,
      workflowName,
      threadId: threadId ?? crypto.randomUUID(),
      messages: [],
      streamingText: "",
      isStreaming: false,
      humanWaiting: null,
    });
  },

  reset: () => {
    set({
      workflowId: null,
      workflowName: "",
      threadId: null,
      messages: [],
      streamingText: "",
      isStreaming: false,
      humanWaiting: null,
    });
  },

  hydrateFromThread: async (threadId) => {
    const status = await chatApi.fetchThreadStatus(threadId);
    if (status.status === "waiting_human" && status.checkpoint_ns) {
      set({
        humanWaiting: {
          node_id: status.pending_node_id ?? "",
          question: status.pending_question ?? "请确认",
          checkpoint_ns: status.checkpoint_ns,
        },
        messages: [
          {
            id: crypto.randomUUID(),
            role: "human_waiting",
            content: status.pending_question ?? "请确认",
          },
        ],
      });
    }
  },

  sendMessage: async (text) => {
    const { workflowId, threadId } = get();
    if (!workflowId || !threadId) throw new Error("会话未初始化");

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    set((s) => ({
      messages: [...s.messages, userMsg],
      isStreaming: true,
      streamingText: "",
      humanWaiting: null,
    }));

    assistantMsgId = crypto.randomUUID();

    const handleEvent = (evt: chatApi.ChatSseEvent) => {
      if (evt.event === "llm_delta") {
        const delta = String(evt.data.content ?? "");
        set((s) => ({ streamingText: s.streamingText + delta }));
      }
      if (evt.event === "node_end" && evt.data.node_type === "llm") {
        /* noop — deltas already accumulated */
      }
      if (evt.event === "human_waiting") {
        set({
          humanWaiting: evt.data as unknown as HumanWaitingData,
          isStreaming: false,
        });
        set((s) => ({
          messages: [
            ...s.messages,
            {
              id: crypto.randomUUID(),
              role: "human_waiting",
              content: String(evt.data.question ?? "请确认"),
            },
          ],
        }));
      }
      if (evt.event === "done") {
        const finalText = get().streamingText || String(evt.data.final_output ?? "");
        set((s) => ({
          isStreaming: false,
          streamingText: "",
          messages: finalText
            ? [
                ...s.messages,
                { id: assistantMsgId!, role: "assistant", content: finalText },
              ]
            : s.messages,
        }));
      }
      if (evt.event === "error") {
        set({ isStreaming: false });
        throw new Error(String(evt.data.msg ?? "执行失败"));
      }
    };

    try {
      await chatApi.streamExecute(
        { workflow_id: workflowId, thread_id: threadId, input_text: text },
        handleEvent,
      );
      if (get().isStreaming && get().streamingText) {
        set((s) => ({
          isStreaming: false,
          messages: [
            ...s.messages,
            { id: assistantMsgId!, role: "assistant", content: s.streamingText },
          ],
          streamingText: "",
        }));
      }
    } catch (e) {
      set({ isStreaming: false });
      throw e;
    }
  },

  confirmHuman: async (confirmed, comment) => {
    const { threadId, humanWaiting } = get();
    if (!threadId || !humanWaiting) throw new Error("无待确认的人工节点");

    set({ isStreaming: true, humanWaiting: null });
    assistantMsgId = crypto.randomUUID();
    set({ streamingText: "" });

    const handleEvent = (evt: chatApi.ChatSseEvent) => {
      if (evt.event === "llm_delta") {
        set((s) => ({ streamingText: s.streamingText + String(evt.data.content ?? "") }));
      }
      if (evt.event === "human_waiting") {
        set({
          humanWaiting: evt.data as unknown as HumanWaitingData,
          isStreaming: false,
        });
      }
      if (evt.event === "done") {
        const finalText = get().streamingText || String(evt.data.final_output ?? "");
        set((s) => ({
          isStreaming: false,
          streamingText: "",
          messages: [
            ...s.messages,
            { id: crypto.randomUUID(), role: "user", content: comment ?? (confirmed ? "已确认" : "已拒绝") },
            ...(finalText
              ? [{ id: assistantMsgId!, role: "assistant" as const, content: finalText }]
              : []),
          ],
        }));
      }
      if (evt.event === "error") {
        set({ isStreaming: false });
        throw new Error(String(evt.data.msg ?? "续跑失败"));
      }
    };

    await chatApi.streamResume(
      {
        thread_id: threadId,
        checkpoint_ns: humanWaiting.checkpoint_ns,
        user_input: { confirmed, comment },
      },
      handleEvent,
    );
  },
}));
