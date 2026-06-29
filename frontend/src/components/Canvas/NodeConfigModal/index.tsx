import { Form, Input, InputNumber, Modal } from "antd";
import { useEffect } from "react";
import type { CanvasNode } from "@/types/canvas";

interface NodeConfigModalProps {
  node: CanvasNode | null;
  open: boolean;
  onClose: () => void;
  onSave: (nodeId: string, config: Record<string, unknown>) => void;
}

export function NodeConfigModal({ node, open, onClose, onSave }: NodeConfigModalProps) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (node && open) {
      const raw: Record<string, unknown> = { ...(node.data.config ?? {}) };
      if (node.type === "router" && Array.isArray(raw.routes)) {
        raw.routes = (raw.routes as string[]).join(", ");
      }
      form.setFieldsValue(raw);
    }
  }, [node, open, form]);

  const handleOk = async () => {
    if (!node) return;
    const values = await form.validateFields();
    if (node.type === "router" && typeof values.routes === "string") {
      values.routes = values.routes.split(",").map((s: string) => s.trim()).filter(Boolean);
    }
    onSave(node.id, values);
    onClose();
  };

  const renderFields = () => {
    switch (node?.type) {
      case "llm":
        return (
          <>
            <Form.Item name="model" label="模型">
              <Input placeholder="gpt-4" />
            </Form.Item>
            <Form.Item name="prompt" label="系统提示词">
              <Input.TextArea rows={4} />
            </Form.Item>
          </>
        );
      case "rag":
        return (
          <Form.Item name="top_k" label="Top K">
            <InputNumber min={1} max={20} style={{ width: "100%" }} />
          </Form.Item>
        );
      case "human":
        return (
          <Form.Item name="question" label="确认问题">
            <Input.TextArea rows={3} />
          </Form.Item>
        );
      case "router":
        return (
          <Form.Item name="routes" label="routes（逗号分隔）" extra="出边 sourceHandle 须与此一致">
            <Input placeholder="approved, rejected" />
          </Form.Item>
        );
      default:
        return <p>该节点类型无需额外配置</p>;
    }
  };

  return (
    <Modal
      title={`配置节点：${node?.data.label ?? node?.type ?? ""}`}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        {renderFields()}
      </Form>
    </Modal>
  );
}
