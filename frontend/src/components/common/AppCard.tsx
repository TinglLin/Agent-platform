import { Button, Card, Space, Tag, Typography, message } from "antd";
import { CheckOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined, EditOutlined } from "@ant-design/icons";
import type { PlaygroundAppItem, UserAppItem } from "@/types/canvas";
import { addToMyApps } from "@/services/workflowApi";

const { Title, Text } = Typography;

interface AppCardProps {
  app: PlaygroundAppItem | UserAppItem;
  loading?: boolean;
  showContinue?: boolean;
  showAddApp?: 'add' | 'added' | 'update';
  onAddApp?: () => void;
  onChat?: () => void;
  onContinue?: () => void;
  onEdit?: () => void;
  onRemove?: () => void;
}

const statusLabels: Record<string, string> = {
  running: "进行中",
  waiting_human: "待人工确认",
  completed: "已完成",
  failed: "失败",
};

export function AppCard({
  app,
  loading,
  showContinue,
  showAddApp,
  onAddApp,
  onChat,
  onContinue,
  onEdit,
  onRemove,
}: AppCardProps) {
  const userApp = app as UserAppItem;
  const canContinue =
    showContinue && userApp.last_thread_id && userApp.thread_status === "waiting_human";

  const handleAddApp = async () => {
    if (onAddApp) {
      onAddApp();
      return;
    }
    try {
      await addToMyApps(app.workflow_id);
      message.success(`已添加「${app.name}」到我的应用`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "添加失败");
    }
  };

  return (
    <Card loading={loading} hoverable style={{ height: "100%" }}>
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <Space align="start">
          <span style={{ fontSize: 32, lineHeight: 1 }}>{app.icon}</span>
          <div>
            <Title level={5} style={{ margin: 0 }}>
              {app.name}
            </Title>
            <Space size={4} wrap style={{ marginTop: 4 }}>
              <Tag color="blue">{app.current_version}</Tag>
              {userApp.thread_status && (
                <Tag color={userApp.thread_status === "waiting_human" ? "orange" : "default"}>
                  {statusLabels[userApp.thread_status] ?? userApp.thread_status}
                </Tag>
              )}
            </Space>
          </div>
        </Space>
        <Text type="secondary">{app.description}</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          更新于 {app.updated_at}
        </Text>

        {showAddApp === 'added' ? (
          <Button block disabled icon={<CheckOutlined />} style={{ color: "#52c41a" }}>
            已添加
          </Button>
        ) : showAddApp === 'update' ? (
          <Button block type="primary" icon={<ReloadOutlined />} onClick={handleAddApp}>
            更新应用
          </Button>
        ) : showAddApp === 'add' ? (
          <Button block type="primary" icon={<PlusOutlined />} onClick={handleAddApp}>
            添加到我的应用
          </Button>
        ) : (
          <>
            <Button block type="primary" icon={<PlusOutlined />} onClick={onChat}>
              开始对话
            </Button>
            {showContinue && (
              <Button
                block
                icon={<ReloadOutlined />}
                disabled={!canContinue}
                onClick={onContinue}
              >
                继续会话
              </Button>
            )}
            {onEdit && (
              <Button block icon={<EditOutlined />} onClick={onEdit}>
                编辑编排
              </Button>
            )}
            {onRemove && (
              <Button block danger icon={<DeleteOutlined />} onClick={onRemove}>
                移除
              </Button>
            )}
          </>
        )}
      </Space>
    </Card>
  );
}
