import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Empty, Input, Layout, Menu, Modal, Space, Tag, Typography, message } from "antd";
import { CloseOutlined, EditOutlined, SendOutlined } from "@ant-design/icons";
import { useChatStore } from "@/stores/chatStore";
import { fetchDrafts, fetchUserApps, deleteWorkflow, publishWorkflow, revertDraft, withdrawWorkflow } from "@/services/workflowApi";
import CanvasPage from "@/pages/Canvas";
import type { PlaygroundAppItem, UserAppItem } from "@/types/canvas";

const { Header, Content } = Layout;
const { Title, Text } = Typography;

export default function StudioPage() {
  const [tab, setTab] = useState<"pubs" | "canvas">("pubs");
  const [editWorkflowId, setEditWorkflowId] = useState<string | undefined>(undefined);
  const [apps, setApps] = useState<PlaygroundAppItem[]>([]);
  const [userApps, setUserApps] = useState<UserAppItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);

  const {
    workflowName, threadId, messages, streamingText, isStreaming, humanWaiting,
    startNewSession, sendMessage, confirmHuman, reset,
  } = useChatStore();

  const loadApps = useCallback(() => {
    setLoading(true);
    Promise.all([fetchDrafts(), fetchUserApps()])
      .then(([playground, user]) => { setApps(playground); setUserApps(user); })
      .catch((e) => message.error(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadApps(); }, [loadApps]);
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, streamingText]);

  const handleTest = (app: PlaygroundAppItem) => {
    setActiveChatId(app.workflow_id);
    startNewSession(app.workflow_id, app.name, undefined);
  };

  const handlePublish = async (app: PlaygroundAppItem) => {
    // 乐观更新
    const newVersion = `v${parseInt((app.current_version || "v0.0.0").replace("v", "").split(".")[0])}.${parseInt((app.current_version || "v0.0.0").replace("v", "").split(".")[1] || "0") + 1}.0`;
    setApps((prev) =>
      prev.map((a) =>
        a.workflow_id === app.workflow_id
          ? { ...a, current_version: newVersion, version_count: (a.version_count || 0) + 1 }
          : a
      )
    );
    setUserApps((prev) =>
      prev.some((u) => u.workflow_id === app.workflow_id)
        ? prev
        : [...prev, { workflow_id: app.workflow_id, name: app.name, current_version: "", icon: app.icon, description: app.description || "", updated_at: "", last_thread_id: null } as unknown as UserAppItem]
    );
    try {
      const res = await fetch(`/api/workflows/${app.workflow_id}/draft`);
      const body = await res.json();
      if (body.code !== 0) throw new Error(body.msg ?? "加载失败");
      const { nodes, edges } = body.data;
      const result = await publishWorkflow({
        workflow_id: app.workflow_id,
        name: app.name,
        description: app.description,
        graph_spec: { nodes, edges },
        version_info: { is_major: false, base_version: app.current_version },
      });
      message.success(result.version.startsWith("v1.0") ? `发布成功 v${result.version}` : `更新成功 v${result.version}`);
      loadApps();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "操作失败");
      loadApps(); // 回滚
    }
  };

  const handleWithdraw = async (app: PlaygroundAppItem) => {
    // 乐观更新：标记为未发布状态
    setApps((prev) =>
      prev.map((a) =>
        a.workflow_id === app.workflow_id
          ? { ...a, current_version: null as unknown as string, version_count: 0 }
          : a
      )
    );
    setUserApps((prev) => prev.filter((u) => u.workflow_id !== app.workflow_id));
    try {
      await withdrawWorkflow(app.workflow_id);
      message.success(`已撤回「${app.name}」`);
      loadApps();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "撤回失败");
      loadApps(); // 回滚
    }
  };

  const handleRevert = async (app: PlaygroundAppItem) => {
    try {
      await revertDraft(app.workflow_id);
      message.success(`已回退「${app.name}」至发布版本`);
      loadApps();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "回退失败");
    }
  };

  const handleDelete = async (app: PlaygroundAppItem) => {
    Modal.confirm({
      title: `删除「${app.name}」`,
      content: "将彻底删除该工作流及所有数据，此操作不可恢复。",
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        setApps((prev) => prev.filter((a) => a.workflow_id !== app.workflow_id));
        try {
          await deleteWorkflow(app.workflow_id);
          message.success(`已删除「${app.name}」`);
          loadApps();
        } catch (e) {
          message.error(e instanceof Error ? e.message : "删除失败");
          loadApps();
        }
      },
    });
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming || humanWaiting) return;
    const text = input.trim(); setInput("");
    try { await sendMessage(text); }
    catch (e) { message.error(e instanceof Error ? e.message : "发送失败"); }
  };

  const handleConfirm = async (confirmed: boolean) => {
    try { await confirmHuman(confirmed, confirmed ? "同意" : "拒绝"); }
    catch (e) { message.error(e instanceof Error ? e.message : "确认失败"); }
  };

  const isChatMode = activeChatId !== null;

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ display: "flex", alignItems: "center", gap: 24, background: "#001529", padding: "0 24px" }}>
        <Title level={4} style={{ color: "#fff", margin: 0, whiteSpace: "nowrap" }}>知汇平台编排端</Title>
        <Menu theme="dark" mode="horizontal" selectedKeys={[tab]} style={{ flex: 1, minWidth: 0 }}
          items={[
            { key: "pubs", label: <span onClick={() => setTab("pubs")}>我的发布</span> },
            { key: "canvas", label: <span onClick={() => { setEditWorkflowId(undefined); setTab("canvas"); }}>应用编排</span> },
          ]}
        />
      </Header>
      <Content style={{ padding: tab === "canvas" ? "0" : 24 }}>
        {tab === "pubs" ? (
          <>
            {!loading && apps.length === 0 ? (
              <Empty description="暂无已发布应用，请编排后发布" />
            ) : (
              <div style={{ display: "flex", gap: 16, transition: "all 0.4s ease" }}>
                <div style={{
                  width: isChatMode ? "20%" : "100%",
                  minWidth: isChatMode ? 180 : 0, overflowY: "auto",
                  maxHeight: isChatMode ? "calc(100vh - 200px)" : "none",
                  transition: "all 0.4s ease",
                  display: "grid",
                  gridTemplateColumns: isChatMode ? "1fr" : "repeat(5, 1fr)",
                  gap: 16,
                }}>
                  {apps.map((app) => {
                    const isPublished = !!app.current_version;
                    const canUpdate = isPublished && app.needs_update;
                    const isFirstVersion = !isPublished;
                    const publishBtnText = isFirstVersion ? "发 布" : "更 新";
                    const publishDisabled = isPublished && !canUpdate;
                    const isInUserApp = userApps.some((u) => u.workflow_id === app.workflow_id);
                    const withdrawBtnText = canUpdate ? "回 退" : "撤 回";
                    const withdrawDisabled = isFirstVersion || (isPublished && !canUpdate ? !isInUserApp : false);
                    const withdrawHandler = canUpdate ? () => handleRevert(app) : () => handleWithdraw(app);
                    return (
                    <Card key={app.workflow_id} hoverable size="small" style={{ height: "100%", position: "relative" }}>
                      <Button
                        type="text"
                        size="small"
                        danger
                        disabled={isPublished}
                        icon={<CloseOutlined />}
                        style={{ position: "absolute", top: 4, right: 4, zIndex: 1 }}
                        onClick={() => handleDelete(app)}
                      />
                      <Space direction="vertical" style={{ width: "100%" }} size="small">
                        <Space>
                          <span style={{ fontSize: 24 }}>{app.icon}</span>
                          <div>
                            <Text strong>{app.name}</Text>
                            <br />{app.current_version ? <Tag color="blue">{app.current_version}</Tag> : <Tag>未发布</Tag>}
                          </div>
                        </Space>
                        <Text type="secondary" style={{ fontSize: 12 }}>{app.description}</Text>
                        <Button block size="small" onClick={() => handleTest(app)}>测试</Button>
                        <Button block size="small" icon={<EditOutlined />}
                          onClick={() => { setEditWorkflowId(app.workflow_id); setTab("canvas"); }}>编排</Button>
                        <Button block size="small" type="primary"
                          disabled={publishDisabled}
                          onClick={() => handlePublish(app)}>{publishBtnText}</Button>
                        <Button block size="small" danger
                          disabled={withdrawDisabled}
                          onClick={withdrawHandler}>{withdrawBtnText}</Button>
                      </Space>
                    </Card>
                    );
                  })}
                </div>
                <div style={{
                  flex: isChatMode ? 1 : 0, width: isChatMode ? "80%" : 0,
                  overflow: "hidden", opacity: isChatMode ? 1 : 0, transition: "all 0.4s ease",
                }}>
                  {isChatMode && (
                    <div>
                      <Space style={{ marginBottom: 12 }}>
                        <Text strong style={{ fontSize: 16 }}>{workflowName}</Text>
                        {threadId && <Tag color="blue">thread: {threadId.slice(0, 8)}…</Tag>}
                        <Button size="small" onClick={() => { setActiveChatId(null); reset(); }}>返回</Button>
                      </Space>
                      <div ref={chatRef} style={{
                        background: "#fff", borderRadius: 8, border: "1px solid #f0f0f0",
                        padding: 16, minHeight: 360, maxHeight: "calc(100vh - 320px)",
                        overflowY: "auto", marginBottom: 12,
                      }}>
                        {messages.length === 0 && !isStreaming && (
                          <Text type="secondary" style={{ display: "block", textAlign: "center", paddingTop: 80 }}>开始测试对话</Text>
                        )}
                        {messages.map((m) => (
                          <div key={m.id} style={{
                            alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                            background: m.role === "user" ? "#e6f4ff" : "#f5f5f5",
                            padding: "8px 12px", borderRadius: 8, maxWidth: "85%",
                          }}>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              {m.role === "user" ? "你" : m.role === "assistant" ? "AI" : "系统"}
                            </Text>
                            <div>{m.content}</div>
                          </div>
                        ))}
                        {isStreaming && streamingText && (
                          <div style={{ background: "#f5f5f5", padding: "8px 12px", borderRadius: 8 }}>
                            {streamingText}<span style={{ animation: "blink 1s step-end infinite" }}>▌</span>
                          </div>
                        )}
                      </div>
                      {humanWaiting && (
                        <div style={{ border: "1px solid #fa8c16", borderRadius: 8, padding: "12px 16px", marginBottom: 12, background: "#fff7e6" }}>
                          <Text strong>人工确认：{humanWaiting.question}</Text>
                          <Space style={{ marginTop: 8 }}>
                            <Button type="primary" onClick={() => handleConfirm(true)}>确认</Button>
                            <Button danger onClick={() => handleConfirm(false)}>拒绝</Button>
                          </Space>
                        </div>
                      )}
                      <Space.Compact style={{ width: "100%" }}>
                        <Input value={input} onChange={(e) => setInput(e.target.value)}
                          onPressEnter={handleSend} placeholder="输入消息…"
                          disabled={isStreaming || !!humanWaiting} />
                        <Button type="primary" icon={<SendOutlined />} onClick={handleSend}
                          disabled={isStreaming || !!humanWaiting}>发送</Button>
                      </Space.Compact>
                    </div>
                  )}
                </div>
              </div>
            )}
            <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
          </>
        ) : (
          <>
            <div style={{ height: "calc(100vh - 112px)" }}>
              <CanvasPage hidePublish simple workflowId={editWorkflowId} />
            </div>
          </>
        )}
      </Content>
    </Layout>
  );
}
