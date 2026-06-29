import type { CanvasEdge, CanvasNode } from "@/types/canvas";

export interface CanvasValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateCanvasGraph(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): CanvasValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const starts = nodes.filter((n) => n.type === "start");
  const ends = nodes.filter((n) => n.type === "end");

  if (starts.length === 0) errors.push("缺少开始节点（start）");
  if (starts.length > 1) errors.push(`存在 ${starts.length} 个 start，仅允许 1 个`);

  if (ends.length === 0) errors.push("缺少结束节点（end）");
  if (ends.length > 1) errors.push(`存在 ${ends.length} 个 end，仅允许 1 个`);

  const startId = starts[0]?.id;
  const endId = ends[0]?.id;

  if (startId && !edges.some((e) => e.source === startId)) {
    errors.push("开始节点未连接下游");
  }
  if (endId && !edges.some((e) => e.target === endId)) {
    errors.push("结束节点无上游连接");
  }

  const reachable = traverseFromStart(startId, edges);
  nodes.forEach((n) => {
    if (n.type !== "start" && n.type !== "end" && !reachable.has(n.id)) {
      errors.push(`节点 ${n.id} 不可从 start 到达`);
    }
  });

  if (endId && startId && !reachable.has(endId)) {
    errors.push("结束节点不可从 start 到达");
  }

  const idSet = new Set(nodes.map((n) => n.id));
  edges.forEach((e) => {
    if (!idSet.has(e.source)) errors.push(`边 ${e.id} 的 source 不存在`);
    if (!idSet.has(e.target)) errors.push(`边 ${e.id} 的 target 不存在`);
  });

  nodes.forEach((n) => {
    if (!n.data?.config) errors.push(`节点 ${n.id} 缺少 data.config`);
  });

  nodes
    .filter((n) => n.type === "router")
    .forEach((r) => validateRouterEdges(r, edges, errors));

  const cycleMsg = detectPossibleDeadLoop(nodes, edges, startId);
  if (cycleMsg) warnings.push(cycleMsg);

  return { valid: errors.length === 0, errors, warnings };
}

function traverseFromStart(startId: string | undefined, edges: CanvasEdge[]): Set<string> {
  const reachable = new Set<string>();
  if (!startId) return reachable;

  const queue = [startId];
  reachable.add(startId);

  while (queue.length) {
    const cur = queue.shift()!;
    edges
      .filter((e) => e.source === cur)
      .forEach((e) => {
        if (!reachable.has(e.target)) {
          reachable.add(e.target);
          queue.push(e.target);
        }
      });
  }
  return reachable;
}

function validateRouterEdges(router: CanvasNode, edges: CanvasEdge[], errors: string[]) {
  const routes: string[] = router.data?.config?.routes ?? [];
  const out = edges.filter((e) => e.source === router.id);

  out.forEach((e) => {
    const handle = e.sourceHandle ?? "";
    if (routes.length && !routes.includes(handle)) {
      errors.push(
        `Router ${router.id} 出边 handle "${handle}" 不在 routes [${routes.join(", ")}]`,
      );
    }
  });

  routes.forEach((r) => {
    if (!out.some((e) => (e.sourceHandle ?? "") === r)) {
      errors.push(`Router ${router.id} 缺少 routes 项 "${r}" 对应出边`);
    }
  });
}

/** 轻量环检测：无 router 参与的环仅作 UI 警告，不阻断草稿保存 */
function detectPossibleDeadLoop(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  startId: string | undefined,
): string | null {
  if (!startId) return null;

  const adj = new Map<string, string[]>();
  edges.forEach((e) => {
    const list = adj.get(e.source) ?? [];
    list.push(e.target);
    adj.set(e.source, list);
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  let found = false;

  const dfs = (id: string) => {
    if (found) return;
    visiting.add(id);
    for (const next of adj.get(id) ?? []) {
      if (visiting.has(next)) {
        const cycleNodes = [...visiting, next].filter((x, i, arr) => arr.indexOf(x) === i);
        const hasRouter = cycleNodes.some((cid) => nodeMap.get(cid)?.type === "router");
        if (!hasRouter) found = true;
        return;
      }
      if (!visited.has(next)) dfs(next);
    }
    visiting.delete(id);
    visited.add(id);
  };

  dfs(startId);
  return found ? "检测到可能的无跳出条件循环，发布时后端可能拒绝" : null;
}
