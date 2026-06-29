"""工作流相关路由 — publish / playground / 草稿（PROTOCOL.md）。"""

from __future__ import annotations

from flask import Blueprint, current_app, request
from pydantic import ValidationError
from sqlalchemy import text

from api.response import fail, success
from core.graph_builder import GraphValidationError
from nodes.registry import list_node_types
from repositories.db import SessionLocal
from repositories.models import get_engine
from repositories.workflow_repo import WorkflowNotFoundError, WorkflowRepository
from schemas.workflow import PublishRequest, SaveDraftRequest

workflow_bp = Blueprint("workflow", __name__, url_prefix="/api")


@workflow_bp.get("/health")
def health_check():
    """健康检查：验证 Flask 与 SQLite 初始化正常。"""
    cfg = current_app.config["APP_CONFIG"]
    try:
        with get_engine(cfg.DATABASE_URL).connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:
        return fail(5000, f"数据库不可用: {exc}", http_status=500)

    return success(
        {
            "status": "ok",
            "app_env": cfg.APP_ENV,
            "database": "connected",
        },
        msg="ok",
    )


@workflow_bp.get("/node-types")
def node_types():
    """节点类型列表 — 读 NODE_TYPE_MAP。"""
    return success(list_node_types(), msg="ok")


@workflow_bp.post("/workflows/publish")
def publish_workflow():
    """发布工作流：validate_graph + INSERT 不可变 version 行。"""
    body = request.get_json(silent=True)
    if not body:
        return fail(1001, "请求体不能为空")

    try:
        payload = PublishRequest.model_validate(body)
    except ValidationError as exc:
        return fail(1001, str(exc.errors()[0]["msg"]))

    try:
        session = SessionLocal()
        try:
            result = WorkflowRepository(session).publish(
                name=payload.name,
                description=payload.description,
                graph_spec=payload.graph_spec.to_canvas_dict(),
                version_info=payload.version_info.model_dump() if payload.version_info else None,
                workflow_id=payload.workflow_id,
                icon=payload.icon or "🤖",
            )
        finally:
            session.close()
    except GraphValidationError as exc:
        return fail(1003, exc.errors[0] if exc.errors else str(exc), data={"errors": exc.errors})
    except WorkflowNotFoundError as exc:
        return fail(1002, str(exc))

    return success(result, msg="发布成功")


@workflow_bp.get("/workflows/playground")
def playground_list():
    """应用广场 — 已发布工作流卡片。"""
    session = SessionLocal()
    try:
        items = WorkflowRepository(session).list_playground()
    finally:
        session.close()
    return success(items, msg="ok")


@workflow_bp.get("/workflows/drafts")
def drafts_list():
    """列出所有有草稿的工作流。"""
    session = SessionLocal()
    try:
        items = WorkflowRepository(session).list_drafts()
    finally:
        session.close()
    return success(items, msg="ok")


@workflow_bp.post("/users/apps")
def add_user_app():
    """添加到我的应用。"""
    body = request.get_json(silent=True)
    if not body:
        return fail(1001, "请求体不能为空")
    workflow_id = body.get("workflow_id")
    if not workflow_id:
        return fail(1001, "缺少 workflow_id")
    session = SessionLocal()
    try:
        WorkflowRepository(session).add_user_app(workflow_id)
        session.commit()
    except WorkflowNotFoundError as exc:
        return fail(1002, str(exc))
    except Exception as exc:
        return fail(5000, str(exc))
    finally:
        session.close()
    return success({}, msg="已添加到我的应用")


@workflow_bp.delete("/users/apps/<workflow_id>")
def remove_user_app(workflow_id: str):
    """从我的应用删除。"""
    session = SessionLocal()
    try:
        WorkflowRepository(session).remove_user_app(workflow_id)
        session.commit()
    except Exception as exc:
        return fail(5000, str(exc))
    finally:
        session.close()
    return success({}, msg="已移除")


@workflow_bp.get("/users/apps")
def user_apps_list():
    """个人应用列表 — Demo 单用户。"""
    session = SessionLocal()
    try:
        items = WorkflowRepository(session).list_user_apps()
    finally:
        session.close()
    return success(items, msg="ok")


@workflow_bp.post("/workflows")
def save_draft():
    """保存 Canvas 草稿（React Flow nodes/edges）。"""
    body = request.get_json(silent=True)
    if not body:
        return fail(1001, "请求体不能为空")

    try:
        payload = SaveDraftRequest.model_validate(body)
    except ValidationError as exc:
        return fail(1001, str(exc.errors()[0]["msg"]))

    session = SessionLocal()
    try:
        WorkflowRepository(session).save_draft(
            workflow_id=payload.workflow_id,
            name=payload.name,
            nodes=payload.nodes,
            edges=payload.edges,
        )
    finally:
        session.close()

    return success({}, msg="草稿已保存")


@workflow_bp.get("/workflows/<workflow_id>/draft")
def get_draft(workflow_id: str):
    """读取草稿 — Canvas 编辑页加载。"""
    session = SessionLocal()
    try:
        draft = WorkflowRepository(session).get_draft(workflow_id)
    finally:
        session.close()

    if draft is None:
        return fail(1002, "草稿不存在")
    return success(draft, msg="ok")


@workflow_bp.post("/workflows/<workflow_id>/withdraw")
def withdraw_workflow(workflow_id: str):
    """撤回发布。"""
    session = SessionLocal()
    try:
        WorkflowRepository(session).withdraw(workflow_id)
        session.commit()
    except WorkflowNotFoundError as exc:
        return fail(1002, str(exc))
    except Exception as exc:
        return fail(5000, str(exc))
    finally:
        session.close()
    return success({}, msg="已撤回")


@workflow_bp.post("/workflows/<workflow_id>/revert-draft")
def revert_draft(workflow_id: str):
    """回退草稿到已发布版本。"""
    session = SessionLocal()
    try:
        WorkflowRepository(session).revert_draft(workflow_id)
        session.commit()
    except WorkflowNotFoundError as exc:
        return fail(1002, str(exc))
    except Exception as exc:
        return fail(5000, str(exc))
    finally:
        session.close()
    return success({}, msg="已回退至发布版本")


@workflow_bp.delete("/workflows/<workflow_id>")
def delete_workflow(workflow_id: str):
    """彻底删除工作流。"""
    session = SessionLocal()
    try:
        WorkflowRepository(session).delete_workflow(workflow_id)
        session.commit()
    except WorkflowNotFoundError as exc:
        return fail(1002, str(exc))
    except Exception as exc:
        return fail(5000, str(exc))
    finally:
        session.close()
    return success({}, msg="已删除")
