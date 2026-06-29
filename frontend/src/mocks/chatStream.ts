/** SSE 事件 Mock 序列 — P4 chatApi 联调时使用（PROTOCOL §3 / §4） */
export const mockChatStreamEvents = [
  { event: "node_start", data: { node_id: "node_llm", node_type: "llm" } },
  { event: "llm_delta", data: { content: "你好", node_id: "node_llm" } },
  { event: "llm_delta", data: { content: "，请问有什么可以帮您？", node_id: "node_llm" } },
  { event: "node_end", data: { node_id: "node_llm", output: "你好，请问有什么可以帮您？" } },
  { event: "done", data: { final_output: "你好，请问有什么可以帮您？", thread_id: "mock-thread-id" } },
];

export const mockHumanWaitingEvent = {
  event: "human_waiting",
  data: {
    node_id: "node_human",
    question: "请确认是否退款?",
    checkpoint_ns: "mock:checkpoint:ns",
  },
};
