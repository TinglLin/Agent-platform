import { Handle, Position, type NodeProps } from "reactflow";

const shellStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "2px solid",
  minWidth: 120,
  fontSize: 13,
  background: "#fff",
};

interface ShellProps {
  title: string;
  color: string;
  children?: React.ReactNode;
  source?: boolean;
  target?: boolean;
  sourceHandles?: string[];
}

function NodeShell({ title, color, children, source = true, target = true, sourceHandles }: ShellProps) {
  const handles = sourceHandles ?? (source ? [undefined] : []);

  return (
    <div style={{ ...shellStyle, borderColor: color }}>
      {target && <Handle type="target" position={Position.Left} />}
      <strong>{title}</strong>
      {children && <div style={{ marginTop: 4, color: "#666", fontSize: 12 }}>{children}</div>}
      {handles.map((h, i) => (
        <Handle
          key={h ?? "default"}
          id={h}
          type="source"
          position={Position.Right}
          style={{ top: sourceHandles ? `${30 + i * 24}px` : undefined }}
        />
      ))}
    </div>
  );
}

export function StartNode({ data }: NodeProps) {
  return <NodeShell title={data.label ?? "开始"} color="#52c41a" target={false} />;
}

export function EndNode({ data }: NodeProps) {
  return <NodeShell title={data.label ?? "结束"} color="#ff4d4f" source={false} />;
}

export function LlmNode({ data }: NodeProps) {
  return (
    <NodeShell title={data.label ?? "LLM"} color="#1677ff">
      {String(data.config?.model ?? "gpt-4")}
    </NodeShell>
  );
}

export function RagNode({ data }: NodeProps) {
  return (
    <NodeShell title={data.label ?? "RAG"} color="#722ed1">
      top_k={String(data.config?.top_k ?? 3)}
    </NodeShell>
  );
}

export function HumanNode({ data }: NodeProps) {
  return (
    <NodeShell title={data.label ?? "人工"} color="#fa8c16">
      需确认
    </NodeShell>
  );
}

export function RouterNode({ data }: NodeProps) {
  const routes = (data.config?.routes as string[] | undefined) ?? ["approved", "rejected"];
  return (
    <NodeShell title={data.label ?? "路由"} color="#13c2c2" sourceHandles={routes}>
      {routes.join(" / ")}
    </NodeShell>
  );
}

export const customNodeTypes = {
  start: StartNode,
  end: EndNode,
  llm: LlmNode,
  rag: RagNode,
  human: HumanNode,
  router: RouterNode,
};
