import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type NodeMouseHandler,
} from "reactflow";
import "reactflow/dist/style.css";
import { Button, Card, Input, Space, Typography, message } from "antd";
import { customNodeTypes } from "@/components/Canvas/CustomNodes";
import { NodeConfigModal } from "@/components/Canvas/NodeConfigModal";
import { ValidateBar } from "@/components/Canvas/ValidateBar";
import { mockNodeTypes } from "@/mocks/nodeTypes";
import { useWorkflowStore } from "@/stores/workflowStore";
import type { CanvasNode } from "@/types/canvas";

const { Title } = Typography;

export default function CanvasPage({ hidePublish, workflowId: propWorkflowId, simple }: { hidePublish?: boolean; workflowId?: string; simple?: boolean }) {
  const { workflowId: paramWorkflowId } = useParams<{ workflowId?: string }>();
  const [searchParams] = useSearchParams();
  const effectiveHidePublish = hidePublish ?? searchParams.get("saveOnly") === "1";
  const workflowId = propWorkflowId ?? paramWorkflowId;
  const [configNode, setConfigNode] = useState<CanvasNode | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const {
    workflowName,
    nodes,
    edges,
    loadDraft,
    resetCanvas,
    setWorkflowMeta,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    updateNodeConfig,
    runValidation,
  } = useWorkflowStore();

  useEffect(() => {
    const id = workflowId ?? `wf_${crypto.randomUUID().slice(0, 8)}`;
    if (workflowId) {
      loadDraft(workflowId).catch((e) => {
        message.error(e instanceof Error ? e.message : "加载失败");
        resetCanvas(id);
      });
    } else {
      resetCanvas(id);
    }
  }, [workflowId, loadDraft, resetCanvas]);

  useEffect(() => {
    const timer = setTimeout(() => runValidation(), 300);
    return () => clearTimeout(timer);
  }, [nodes, edges, runValidation]);

  const onNodeDoubleClick: NodeMouseHandler = useCallback((_e, node) => {
    setConfigNode(node as CanvasNode);
    setModalOpen(true);
  }, []);

  const handleAddNode = (type: string) => {
    if (type === "start" && nodes.some((n) => n.type === "start")) {
      message.warning("画布仅允许一个 start 节点");
      return;
    }
    if (type === "end" && nodes.some((n) => n.type === "end")) {
      message.warning("画布仅允许一个 end 节点");
      return;
    }
    addNode(type, { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 });
  };

  const nodeTypes = useMemo(() => customNodeTypes, []);

  return (
    <div style={{ height: simple ? "100%" : "100vh", display: "flex", flexDirection: "column" }}>
      {!simple && (
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #f0f0f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Space>
            <Title level={4} style={{ margin: 0 }}>
            知汇平台编排端
            </Title>
            <Input
              value={workflowName}
              onChange={(e) => setWorkflowMeta(e.target.value)}
              style={{ width: 220 }}
              placeholder="应用名称"
            />
          </Space>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ width: 160, display: "flex", flexDirection: "column", gap: 0 }}>
          {simple && (
            <Input
              value={workflowName}
              onChange={(e) => setWorkflowMeta(e.target.value)}
              placeholder="应用名称"
              style={{ borderRadius: 0, borderLeft: "none", borderRight: "none", borderTop: "none" }}
            />
          )}
          <Card
            size="small"
            title="节点面板"
            style={{ flex: 1, borderRadius: 0, overflow: "auto" }}
            bodyStyle={{ padding: 8 }}
          >
          <Space direction="vertical" style={{ width: "100%" }}>
            {mockNodeTypes
              .filter((t) => t.type !== "start" && t.type !== "end")
              .map((t) => (
                <Button key={t.type} block size="small" onClick={() => handleAddNode(t.type)}>
                  {t.label}
                </Button>
              ))}
          </Space>
        </Card>
        </div>

        <div style={{ flex: 1 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDoubleClick={onNodeDoubleClick}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>
      </div>

      <ValidateBar hidePublish={effectiveHidePublish} />

      <NodeConfigModal
        node={configNode}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={updateNodeConfig}
      />
    </div>
  );
}
