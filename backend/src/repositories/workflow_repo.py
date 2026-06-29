"""工作流版本 CRUD — 已发布版本只读，新版本 INSERT（AGENT.md §3.4）。"""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from core.graph_builder import GraphValidationError, validate_graph
from repositories.models import Thread, ThreadMessage, UserApp, Workflow, WorkflowDraft, WorkflowVersion


class WorkflowConflictError(Exception):
    pass


class WorkflowNotFoundError(Exception):
    pass


def bump_version(version: str, is_major: bool) -> str:
    """PROTOCOL §1：major → v{n+1}.0.0；minor → v{n}.{m+1}.0。"""
    match = re.match(r"^v?(\d+)\.(\d+)(?:\.(\d+))?$", version.strip())
    if not match:
        return "v1.0.0"
    major, minor = int(match.group(1)), int(match.group(2))
    if is_major:
        return f"v{major + 1}.0.0"
    return f"v{major}.{minor + 1}.0"


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def _utc_date() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


class WorkflowRepository:
    def __init__(self, session: Session):
        self.session = session

    def publish(
        self,
        *,
        name: str,
        graph_spec: dict,
        description: str | None = None,
        version_info: dict | None = None,
        workflow_id: str | None = None,
        icon: str = "🤖",
    ) -> dict[str, str]:
        validate_graph(graph_spec)
        graph_json = json.dumps(graph_spec, ensure_ascii=False)

        info = version_info or {}
        is_major = bool(info.get("is_major", False))
        base_version = info.get("base_version")

        wf_id = workflow_id or f"wf_{uuid.uuid4().hex[:12]}"
        workflow = self.session.get(Workflow, wf_id)
        version_count = (
            self.session.query(WorkflowVersion).filter(WorkflowVersion.workflow_id == wf_id).count()
        )
        prev_current = workflow.current_version if workflow else None

        if version_count == 0:
            new_version = "v1.0.0"
            record_base = base_version
        else:
            if workflow is None:
                raise WorkflowNotFoundError(f"工作流 {wf_id} 不存在")
            bump_base = base_version or prev_current or "v1.0.0"
            new_version = bump_version(bump_base, is_major)
            record_base = base_version or prev_current

        now = _utc_now()
        if workflow is None:
            workflow = Workflow(
                workflow_id=wf_id,
                name=name,
                description=description,
                icon=icon,
                current_version=new_version,
                created_at=now,
                updated_at=now,
            )
            self.session.add(workflow)
        else:
            workflow.name = name
            workflow.description = description
            if icon:
                workflow.icon = icon
            workflow.current_version = new_version
            workflow.updated_at = now

        self.session.add(
            WorkflowVersion(
                workflow_id=wf_id,
                version=new_version,
                graph_spec_json=graph_json,
                is_major=1 if is_major else 0,
                base_version=record_base,
                published_at=now,
            )
        )

        self.session.commit()
        return {"workflow_id": wf_id, "version": new_version}

    def save_draft(
        self,
        *,
        workflow_id: str,
        name: str,
        nodes: list,
        edges: list,
    ) -> None:
        now = _utc_now()
        workflow = self.session.get(Workflow, workflow_id)
        if workflow is None:
            workflow = Workflow(
                workflow_id=workflow_id,
                name=name,
                created_at=now,
                updated_at=now,
            )
            self.session.add(workflow)
        else:
            workflow.name = name
            workflow.updated_at = now

        canvas_json = json.dumps({"nodes": nodes, "edges": edges}, ensure_ascii=False)
        draft = self.session.get(WorkflowDraft, workflow_id)
        if draft is None:
            self.session.add(
                WorkflowDraft(workflow_id=workflow_id, canvas_json=canvas_json, updated_at=now)
            )
        else:
            draft.canvas_json = canvas_json
            draft.updated_at = now

        self.session.commit()

    def get_draft(self, workflow_id: str) -> dict | None:
        workflow = self.session.get(Workflow, workflow_id)
        draft = self.session.get(WorkflowDraft, workflow_id)
        if draft is None:
            return None
        payload = json.loads(draft.canvas_json)
        return {
            "workflow_id": workflow_id,
            "name": workflow.name if workflow else "未命名应用",
            "description": workflow.description,
            "nodes": payload.get("nodes", []),
            "edges": payload.get("edges", []),
        }

    def list_playground(self) -> list[dict]:
        rows = (
            self.session.query(Workflow)
            .filter(Workflow.current_version.isnot(None))
            .order_by(Workflow.updated_at.desc())
            .all()
        )
        return [self._to_card(row) for row in rows]

    def list_drafts(self) -> list[dict]:
        """列出所有有草稿的工作流（含已发布和未发布）。"""
        rows = (
            self.session.query(Workflow, WorkflowDraft)
            .join(WorkflowDraft, WorkflowDraft.workflow_id == Workflow.workflow_id)
            .order_by(Workflow.updated_at.desc())
            .all()
        )
        result: list[dict] = []
        for workflow, draft in rows:
            card = self._to_card(workflow)
            # 判断草稿是否比最新版本新
            if workflow.current_version:
                latest_ver = (
                    self.session.query(WorkflowVersion)
                    .filter(
                        WorkflowVersion.workflow_id == workflow.workflow_id,
                        WorkflowVersion.version == workflow.current_version,
                    )
                    .one_or_none()
                )
                needs_update = (
                    latest_ver is not None and draft.updated_at > latest_ver.published_at
                ) if latest_ver else False
            else:
                needs_update = False
            card["needs_update"] = needs_update
            result.append(card)
        return result

    def add_user_app(self, workflow_id: str) -> None:
        workflow = self.session.get(Workflow, workflow_id)
        if workflow is None or not workflow.current_version:
            raise WorkflowNotFoundError(f"工作流 {workflow_id} 不存在或未发布")
        existing = self.session.query(UserApp).filter(UserApp.workflow_id == workflow_id).one_or_none()
        if existing is None:
            self.session.add(UserApp(workflow_id=workflow_id, added_at=_utc_now()))

    def remove_user_app(self, workflow_id: str) -> None:
        self.session.query(UserApp).filter(UserApp.workflow_id == workflow_id).delete()

    def withdraw(self, workflow_id: str) -> None:
        """撤回发布：清空 current_version，应用广场不再显示。"""
        workflow = self.session.get(Workflow, workflow_id)
        if workflow is None:
            raise WorkflowNotFoundError(f"工作流 {workflow_id} 不存在")
        workflow.current_version = None
        workflow.updated_at = _utc_now()

    def revert_draft(self, workflow_id: str) -> None:
        """回退草稿到最新已发布版本的图谱。"""
        workflow = self.session.get(Workflow, workflow_id)
        if workflow is None or not workflow.current_version:
            raise WorkflowNotFoundError(f"工作流 {workflow_id} 未发布")
        spec = self.get_published_graph_spec(workflow_id, workflow.current_version)
        self.session.query(WorkflowDraft).filter(WorkflowDraft.workflow_id == workflow_id).delete()
        self.session.add(WorkflowDraft(
            workflow_id=workflow_id,
            canvas_json=json.dumps(spec, ensure_ascii=False),
            updated_at=_utc_now(),
        ))
        workflow.updated_at = _utc_now()

    def delete_workflow(self, workflow_id: str) -> None:
        """彻底删除工作流及关联数据。"""
        workflow = self.session.get(Workflow, workflow_id)
        if workflow is None:
            raise WorkflowNotFoundError(f"工作流 {workflow_id} 不存在")
        # 级联删除：版本、草稿、用户关联、对话
        self.session.query(ThreadMessage).filter(
            ThreadMessage.thread_id.in_(
                self.session.query(Thread.thread_id).filter(Thread.workflow_id == workflow_id)
            )
        ).delete(synchronize_session=False)
        self.session.query(Thread).filter(Thread.workflow_id == workflow_id).delete()
        self.session.query(UserApp).filter(UserApp.workflow_id == workflow_id).delete()
        self.session.query(WorkflowVersion).filter(WorkflowVersion.workflow_id == workflow_id).delete()
        self.session.query(WorkflowDraft).filter(WorkflowDraft.workflow_id == workflow_id).delete()
        self.session.delete(workflow)

    def list_user_apps(self) -> list[dict]:
        rows = (
            self.session.query(Workflow, UserApp)
            .join(UserApp, UserApp.workflow_id == Workflow.workflow_id)
            .order_by(UserApp.added_at.desc())
            .all()
        )
        items: list[dict] = []
        for workflow, app in rows:
            card = self._to_card(workflow)
            card["last_thread_id"] = app.last_thread_id
            if app.last_thread_id:
                thread = self.session.get(Thread, app.last_thread_id)
                card["thread_status"] = thread.status if thread else None
            items.append(card)
        return items

    def get_workflow(self, workflow_id: str) -> Workflow | None:
        return self.session.get(Workflow, workflow_id)

    def get_published_graph_spec(
        self, workflow_id: str, version: str | None = None
    ) -> dict:
        workflow = self.session.get(Workflow, workflow_id)
        if workflow is None:
            raise WorkflowNotFoundError(f"工作流 {workflow_id} 不存在")

        target_version = version or workflow.current_version
        if not target_version:
            raise WorkflowNotFoundError(f"工作流 {workflow_id} 尚未发布")

        row = (
            self.session.query(WorkflowVersion)
            .filter(
                WorkflowVersion.workflow_id == workflow_id,
                WorkflowVersion.version == target_version,
            )
            .one_or_none()
        )
        if row is None:
            raise WorkflowNotFoundError(f"版本 {target_version} 不存在")
        return json.loads(row.graph_spec_json)

    def _to_card(self, workflow: Workflow) -> dict:
        updated = workflow.updated_at[:10] if workflow.updated_at else _utc_date()
        version_count = (
            self.session.query(WorkflowVersion)
            .filter(WorkflowVersion.workflow_id == workflow.workflow_id)
            .count()
        )
        return {
            "workflow_id": workflow.workflow_id,
            "name": workflow.name,
            "description": workflow.description or "",
            "current_version": workflow.current_version or "v1.0.0",
            "icon": workflow.icon or "🤖",
            "updated_at": updated,
            "version_count": version_count,
        }
