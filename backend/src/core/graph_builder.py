"""蓝图 JSON → StateGraph 编译与 validate_graph（SKILL.md §7）。"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from langgraph.constants import END, START
from langgraph.graph import StateGraph

from core.checkpointer import get_checkpointer
from core.state import WorkflowState
from nodes.registry import NODE_TYPE_MAP


class GraphValidationError(Exception):
    """图结构校验失败。"""

    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("; ".join(errors))


def validate_graph(canvas_json: dict[str, Any]) -> None:
    """校验单 start/end 与纯死循环；失败 raise GraphValidationError。"""
    errors: list[str] = []
    nodes = canvas_json.get("nodes") or []
    edges = canvas_json.get("edges") or []

    if not nodes:
        errors.append("图不能为空")
        raise GraphValidationError(errors)

    node_map = {n["id"]: n for n in nodes}
    starts = [n for n in nodes if n.get("type") == "start"]
    ends = [n for n in nodes if n.get("type") == "end"]

    if len(starts) == 0:
        errors.append("缺少开始节点（start）")
    if len(starts) > 1:
        errors.append(f"存在 {len(starts)} 个 start，仅允许 1 个")
    if len(ends) == 0:
        errors.append("缺少结束节点（end）")
    if len(ends) > 1:
        errors.append(f"存在 {len(ends)} 个 end，仅允许 1 个")

    start_id = starts[0]["id"] if starts else None
    end_id = ends[0]["id"] if ends else None

    if start_id and not any(e.get("source") == start_id for e in edges):
        errors.append("开始节点未连接下游")
    if end_id and not any(e.get("target") == end_id for e in edges):
        errors.append("结束节点无上游连接")

    reachable = _traverse_from(start_id, edges)
    for n in nodes:
        ntype = n.get("type")
        if ntype not in ("start", "end") and n["id"] not in reachable:
            errors.append(f"节点 {n['id']} 不可从 start 到达")

    if end_id and start_id and end_id not in reachable:
        errors.append("结束节点不可从 start 到达")

    id_set = set(node_map)
    for e in edges:
        if e.get("source") not in id_set:
            errors.append(f"边 {e.get('id')} 的 source 不存在")
        if e.get("target") not in id_set:
            errors.append(f"边 {e.get('id')} 的 target 不存在")

    for n in nodes:
        ntype = n.get("type")
        if ntype not in NODE_TYPE_MAP:
            errors.append(f"未知节点类型: {ntype}")
        elif ntype not in ("start", "end"):
            cfg = n.get("config")
            if cfg is None and isinstance(n.get("data"), dict):
                cfg = n["data"].get("config")
            if cfg is None:
                errors.append(f"节点 {n['id']} 缺少 config")

    for n in nodes:
        if n.get("type") == "router":
            _validate_router_edges(n, edges, errors)

    cycle_msg = _detect_pure_dead_loop(nodes, edges, start_id)
    if cycle_msg:
        errors.append(cycle_msg)

    if errors:
        raise GraphValidationError(errors)


def compile_graph(canvas_json: dict[str, Any], *, use_checkpointer: bool = True):
    """validate_graph 通过后编译 StateGraph；默认挂载 SqliteSaver。"""
    validate_graph(canvas_json)
    nodes = canvas_json["nodes"]
    edges = canvas_json["edges"]
    node_map = {n["id"]: n for n in nodes}

    builder = StateGraph(WorkflowState)

    for node in nodes:
        ntype = node["type"]
        node_cls = NODE_TYPE_MAP[ntype]
        instance = node_cls()
        raw_cfg = node.get("config")
        if raw_cfg is None and isinstance(node.get("data"), dict):
            raw_cfg = node["data"].get("config")
        cfg = dict(raw_cfg or {})
        node_id = node["id"]

        def make_fn(inst=instance, base_cfg=cfg, nid=node_id):
            def node_fn(state: WorkflowState) -> dict[str, Any]:
                merged_cfg = {**base_cfg, "_node_id": nid}
                updates = inst.execute(state, merged_cfg)
                updates["current_node_id"] = nid
                return updates

            return node_fn

        builder.add_node(node_id, make_fn())

    start_node = next(n for n in nodes if n["type"] == "start")
    end_node = next(n for n in nodes if n["type"] == "end")
    builder.add_edge(START, start_node["id"])
    builder.add_edge(end_node["id"], END)

    router_ids = {n["id"] for n in nodes if n["type"] == "router"}
    edges_by_source: dict[str, list[dict]] = defaultdict(list)
    for edge in edges:
        edges_by_source[edge["source"]].append(edge)

    for source_id, out_edges in edges_by_source.items():
        if source_id in router_ids:
            _add_router_conditional_edges(builder, source_id, out_edges, node_map)
            continue
        for edge in out_edges:
            builder.add_edge(edge["source"], edge["target"])

    checkpointer = get_checkpointer() if use_checkpointer else None
    return builder.compile(checkpointer=checkpointer)


def _add_router_conditional_edges(
    builder: StateGraph,
    router_id: str,
    out_edges: list[dict],
    node_map: dict[str, dict],
) -> None:
    router = node_map[router_id]
    routes = (router.get("config") or {}).get("routes") or ["default"]
    path_map: dict[str, str] = {}

    for edge in out_edges:
        handle = edge.get("sourceHandle") or edge.get("source_handle")
        if handle is None and len(routes) == 1:
            handle = routes[0]
        if handle is None:
            raise GraphValidationError([f"Router {router_id} 出边缺少 sourceHandle"])
        path_map[str(handle)] = edge["target"]

    for route in routes:
        if route not in path_map:
            raise GraphValidationError([f"Router {router_id} 缺少 routes 项 '{route}' 对应出边"])

    def pick_route(state: WorkflowState) -> str:
        # conditional_edges 路由：读 RouterNode 写入的 next_node_id（须与 path_map 键一致）
        key = state.get("next_node_id") or routes[0]
        if key not in path_map:
            return routes[0]
        return key

    builder.add_conditional_edges(router_id, pick_route, path_map)


def _traverse_from(start_id: str | None, edges: list[dict]) -> set[str]:
    if not start_id:
        return set()
    reachable = {start_id}
    queue = [start_id]
    while queue:
        cur = queue.pop(0)
        for e in edges:
            if e.get("source") == cur and e.get("target") not in reachable:
                reachable.add(e["target"])
                queue.append(e["target"])
    return reachable


def _validate_router_edges(router: dict, edges: list[dict], errors: list[str]) -> None:
    routes = (router.get("config") or {}).get("routes") or []
    out = [e for e in edges if e.get("source") == router["id"]]
    for e in out:
        handle = e.get("sourceHandle") or e.get("source_handle") or ""
        if routes and handle not in routes:
            errors.append(
                f"Router {router['id']} 出边 handle '{handle}' 不在 routes [{', '.join(routes)}]"
            )
    for r in routes:
        if not any((e.get("sourceHandle") or e.get("source_handle") or "") == r for e in out):
            errors.append(f"Router {router['id']} 缺少 routes 项 '{r}' 对应出边")


def _detect_pure_dead_loop(
    nodes: list[dict],
    edges: list[dict],
    start_id: str | None,
) -> str | None:
    if not start_id:
        return None

    node_types = {n["id"]: n.get("type") for n in nodes}
    adj: dict[str, list[str]] = defaultdict(list)
    for e in edges:
        adj[e["source"]].append(e["target"])

    visiting: set[str] = set()
    visited: set[str] = set()
    found = False

    def dfs(node_id: str) -> None:
        nonlocal found
        if found:
            return
        visiting.add(node_id)
        for nxt in adj.get(node_id, []):
            if nxt in visiting:
                cycle = set(visiting)
                cycle.add(nxt)
                if not any(node_types.get(cid) == "router" for cid in cycle):
                    found = True
                return
            if nxt not in visited:
                dfs(nxt)
        visiting.remove(node_id)
        visited.add(node_id)

    dfs(start_id)
    return "检测到无跳出条件的纯循环（需 router 分支）" if found else None


# Flask 启动自检用最小合法图
STARTUP_CANONICAL_GRAPH: dict[str, Any] = {
    "nodes": [
        {"id": "s", "type": "start", "position": {"x": 0, "y": 0}, "config": {}},
        {"id": "e", "type": "end", "position": {"x": 100, "y": 0}, "config": {}},
    ],
    "edges": [{"id": "e1", "source": "s", "target": "e"}],
}
