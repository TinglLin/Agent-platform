import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Empty, Input, Modal, Space, Tag, Typography, message } from "antd";
import { SendOutlined } from "@ant-design/icons";
import { AppCard } from "@/components/common/AppCard";
import { AppLayout } from "@/components/common/AppLayout";
import { fetchUserApps, removeFromMyApps } from "@/services/workflowApi";
import { useChatStore } from "@/stores/chatStore";
import type { UserAppItem } from "@/types/canvas";

const { Text } = Typography;

export default function MyAppsPage() {
  const navigate = useNavigate();
  const [apps, setApps] = useState<UserAppItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const chatPanelRef = useRef<HTMLDivElement>(null);

  const {
    workflowName,
    threadId,
    messages,
    streamingText,
    isStreaming,
    humanWaiting,
    startNewSession,
    hydrateFromThread,
    sendMessage,
    confirmHuman,
  } = useChatStore();

  const loadApps = useCallback(() => {
    setLoading(true);
    fetchUserApps()
      .then(setApps)
      .catch((e) => message.error(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadApps(); }, [loadApps]);

  // 滚动到聊天底部
  useEffect(() => {
    if (chatPanelRef.current) {
      chatPanelRef.current.scrollTop = chatPanelRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  const handleStartChat = (app: UserAppItem) => {
    setActiveWorkflowId(app.workflow_id);
    startNewSession(app.workflow_id, app.name, undefined);
    if (app.last_thread_id) {
      hydrateFromThread(app.last_thread_id).catch(() => undefined);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming || humanWaiting) return;
    const text = input.trim();
    setInput("");
    try {
      await sendMessage(text);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "发送失败");
    }
  };

  const handleConfirm = async (confirmed: boolean) => {
    try {
      await confirmHuman(confirmed, confirmed ? "同意" : "拒绝");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "确认失败");
    }
  };

  const handleRemove = (app: UserAppItem) => {
    Modal.confirm({
      title: `移除「${app.name}」`,
      content: "将从我的应用中移除，可在应用广场重新添加。",
      okText: "移除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await removeFromMyApps(app.workflow_id);
          message.success(`已移除「${app.name}」`);
          loadApps();
        } catch (e) {
          message.error(e instanceof Error ? e.message : "移除失败");
        }
      },
    });
  };

  const isChatMode = activeWorkflowId !== null;

  return (
    <AppLayout>
      <div style={{ display: "flex", gap: 16, transition: "all 0.4s ease" }}>
        {/* 左侧卡片列表 */}
        <div
          style={{
            width: isChatMode ? "20%" : "100%",
            minWidth: isChatMode ? 180 : 0,
            overflowY: "auto",
            maxHeight: isChatMode ? "calc(100vh - 180px)" : "none",
            transition: "all 0.4s ease",
          }}
        >
          {!loading && apps.length === 0 ? (
            <Empty description="暂无个人应用，在应用广场点击添加到我的应用">
              <Button type="link" onClick={() => navigate("/playground")}>
                前往应用广场
              </Button>
            </Empty>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isChatMode ? "1fr" : "repeat(5, 1fr)",
                gap: 16,
                transition: "all 0.4s ease",
              }}
            >
              {apps.map((app) => {
                return (
                  <div
                    key={app.workflow_id}
                    style={{ transition: "all 0.4s ease" }}
                  >
                    <div style={{ transition: "all 0.4s ease" }}>
                      <AppCard
                        app={app}
                        loading={loading}
                        showContinue
                        onChat={() => handleStartChat(app)}
                        onContinue={() => {
                          setActiveWorkflowId(app.workflow_id);
                          startNewSession(app.workflow_id, app.name, app.last_thread_id ?? undefined);
                          if (app.last_thread_id) {
                            hydrateFromThread(app.last_thread_id).catch(() => undefined);
                          }
                        }}
                        {...(!isChatMode ? { onRemove: () => handleRemove(app) } : {})}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 右侧对话面板 */}
        <div
          style={{
            flex: isChatMode ? 1 : 0,
            width: isChatMode ? "80%" : 0,
            maxWidth: 900,
            overflow: "hidden",
            opacity: isChatMode ? 1 : 0,
            transition: "all 0.4s ease",
          }}
        >
          {isChatMode && (
            <div>
              {/* 会话信息 */}
              <Space style={{ marginBottom: 12 }}>
                <Text strong style={{ fontSize: 16 }}>{workflowName}</Text>
                {threadId && (
                  <Tag color="blue" style={{ fontSize: 11 }}>
                    thread: {threadId.slice(0, 8)}…
                  </Tag>
                )}
              </Space>

              {/* 消息列表 */}
              <div
                ref={chatPanelRef}
                style={{
                  background: "#fff",
                  borderRadius: 8,
                  border: "1px solid #f0f0f0",
                  padding: 16,
                  minHeight: 360,
                  maxHeight: "calc(100vh - 320px)",
                  overflowY: "auto",
                  marginBottom: 12,
                }}
              >
                {messages.length === 0 && !isStreaming && (
                  <Text type="secondary" style={{ display: "block", textAlign: "center", paddingTop: 80 }}>
                    开始一段新的对话
                  </Text>
                )}
                <Space direction="vertical" style={{ width: "100%" }}>
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                        background: m.role === "user" ? "#e6f4ff" : "#f5f5f5",
                        padding: "8px 12px",
                        borderRadius: 8,
                        maxWidth: "85%",
                      }}
                    >
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {m.role === "user" ? "你" : m.role === "assistant" ? "AI" : "系统"}
                      </Text>
                      <div>{m.content}</div>
                    </div>
                  ))}
                  {isStreaming && streamingText && (
                    <div style={{ background: "#f5f5f5", padding: "8px 12px", borderRadius: 8 }}>
                      {streamingText}
                      <span style={{ animation: "blink 1s step-end infinite" }}>▌</span>
                    </div>
                  )}
                </Space>
              </div>

              {/* 人工确认 */}
              {humanWaiting && (
                <div
                  style={{
                    border: "1px solid #fa8c16",
                    borderRadius: 8,
                    padding: "12px 16px",
                    marginBottom: 12,
                    background: "#fff7e6",
                  }}
                >
                  <Text strong>人工确认：{humanWaiting.question}</Text>
                  <Space style={{ marginTop: 8 }}>
                    <Button type="primary" onClick={() => handleConfirm(true)}>确认</Button>
                    <Button danger onClick={() => handleConfirm(false)}>拒绝</Button>
                  </Space>
                </div>
              )}

              {/* 输入框 */}
              <Space.Compact style={{ width: "100%" }}>
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onPressEnter={handleSend}
                  placeholder="输入消息…"
                  disabled={isStreaming || !!humanWaiting}
                />
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={handleSend}
                  disabled={isStreaming || !!humanWaiting}
                >
                  发送
                </Button>
              </Space.Compact>
            </div>
          )}
        </div>
      </div>

      {/* 光标闪烁动画 */}
      <style>{`
        @keyframes blink {
          50% { opacity: 0; }
        }
      `}</style>
    </AppLayout>
  );
}
