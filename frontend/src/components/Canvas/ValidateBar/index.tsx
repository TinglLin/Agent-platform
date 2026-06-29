import { Alert, Button, Space, Tag, Tooltip, message } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";
import { useWorkflowStore } from "@/stores/workflowStore";

interface ValidateBarProps {
  onOpenPublish?: () => void;
  hidePublish?: boolean;
}

/**
 * 画布校验条：展示单入口单出口校验结果，非法图阻断发布。
 */
export function ValidateBar({ onOpenPublish, hidePublish }: ValidateBarProps) {
  const {
    isGraphValid,
    validationErrors,
    validationWarnings,
    isSaving,
    isPublishing,
    saveDraft,
    publish,
  } = useWorkflowStore();

  const handleSave = async () => {
    try {
      await saveDraft();
      message.success("草稿已保存");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  const handlePublish = async () => {
    if (!isGraphValid) return;
    try {
      const result = await publish(false);
      message.success(`发布成功！去应用广场看看吧 😊`);
      onOpenPublish?.();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "发布失败");
    }
  };

  const publishDisabled = !isGraphValid || isPublishing;
  const firstError = validationErrors[0];

  return (
    <div
      style={{
        borderTop: "1px solid #f0f0f0",
        padding: "12px 16px",
        background: "#fafafa",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 200 }}>
        {isGraphValid ? (
          <Space>
            <CheckCircleOutlined style={{ color: "#52c41a" }} />
            <span>单入口单出口校验通过</span>
          </Space>
        ) : (
          <Space wrap>
            <CloseCircleOutlined style={{ color: "#ff4d4f" }} />
            {validationErrors.slice(0, 4).map((err) => (
              <Tag key={err} color="error">
                {err}
              </Tag>
            ))}
            {validationErrors.length > 4 && (
              <Tag>+{validationErrors.length - 4} 项</Tag>
            )}
          </Space>
        )}
        {validationWarnings.length > 0 && (
          <Alert
            type="warning"
            showIcon
            message={validationWarnings.join("；")}
            style={{ marginTop: 8 }}
          />
        )}
      </div>

      <Space>
        <Button loading={isSaving} onClick={handleSave}>
          保存草稿
        </Button>
        {!hidePublish && (
          <Tooltip title={publishDisabled && firstError ? firstError : undefined}>
            <Button type="primary" disabled={publishDisabled} loading={isPublishing} onClick={handlePublish}>
              发布
            </Button>
          </Tooltip>
        )}
      </Space>
    </div>
  );
}
