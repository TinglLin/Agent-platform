import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Button,
  Card,
  Input,
  Space,
  Tag,
  Typography,
  message,
} from "antd";
import { ArrowLeftOutlined, SendOutlined } from "@ant-design/icons";
import { useChatStore } from "@/stores/chatStore";

const { Title, Text } = Typography;

export default function ChatPage() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [input, setInput] = useState("");

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
    reset,
  } = useChatStore();

  useEffect(() => {
    if (!workflowId) return;
    const name = searchParams.get("name") ?? workflowId;
    const existingThread = searchParams.get("thread_id");
    startNewSession(workflowId, name, existingThread ?? undefined);
    if (existingThread) {
      hydrateFromThread(existingThread).catch(() => undefined);
    }
    return () => reset();
  }, [workflowId, searchParams, startNewSession, hydrateFromThread, reset]);

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

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 24, minHeight: "100vh" }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/playground")}>
          返回
        </Button>
        <Title level={4} style={{ margin: 0 }}>
          {workflowName || workflowId}
        </Title>
        {threadId && (
          <Tag color="blue" style={{ fontSize: 11 }}>
            thread: {threadId.slice(0, 8)}…
          </Tag>
        )}
      </Space>

      <Card style={{ marginBottom: 16, minHeight: 360 }}>
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
                {m.role}
              </Text>
              <div>{m.content}</div>
            </div>
          ))}
          {isStreaming && streamingText && (
            <div style={{ background: "#f5f5f5", padding: "8px 12px", borderRadius: 8 }}>
              {streamingText}
              <span className="cursor">▌</span>
            </div>
          )}
        </Space>
      </Card>

      {humanWaiting && (
        <Card style={{ marginBottom: 16, borderColor: "#fa8c16" }}>
          <Text strong>人工确认：{humanWaiting.question}</Text>
          <Space style={{ marginTop: 12 }}>
            <Button type="primary" onClick={() => handleConfirm(true)}>
              确认
            </Button>
            <Button danger onClick={() => handleConfirm(false)}>
              拒绝
            </Button>
          </Space>
        </Card>
      )}

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
  );
}
