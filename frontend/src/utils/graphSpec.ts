import type { CanvasEdge, CanvasNode, GraphSpec } from "@/types/canvas";

/** React Flow 编辑态 → PROTOCOL §1 graph_spec（data.config 提至 config） */
export function toGraphSpec(nodes: CanvasNode[], edges: CanvasEdge[]): GraphSpec {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type ?? "unknown",
      position: n.position,
      config: n.data?.config ?? {},
    })),
    edges: edges.map(({ id, source, target, sourceHandle }) => ({
      id,
      source,
      target,
      ...(sourceHandle != null && sourceHandle !== "" ? { sourceHandle } : {}),
    })),
  };
}
