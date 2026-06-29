"""会话 / thread CRUD — 与 Checkpointer thread_id 对齐。"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from repositories.models import Thread, ThreadMessage, UserApp, Workflow


class SessionNotFoundError(Exception):
    pass


class SessionConflictError(Exception):
    pass


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


class SessionRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_thread(self, thread_id: str) -> Thread | None:
        return self.session.get(Thread, thread_id)

    def ensure_thread_for_execute(
        self,
        *,
        thread_id: str,
        workflow_id: str,
        workflow_version: str,
    ) -> Thread:
        existing = self.session.get(Thread, thread_id)
        if existing:
            if existing.status == "waiting_human":
                raise SessionConflictError("会话处于人工等待，请调用 /api/chat/resume")
            return existing

        workflow = self.session.get(Workflow, workflow_id)
        if workflow is None:
            raise SessionNotFoundError(f"工作流 {workflow_id} 不存在")

        now = _utc_now()
        row = Thread(
            thread_id=thread_id,
            workflow_id=workflow_id,
            workflow_version=workflow_version,
            status="running",
            created_at=now,
            updated_at=now,
        )
        self.session.add(row)
        self.session.commit()
        return row

    def get_thread_for_resume(self, thread_id: str) -> Thread:
        row = self.session.get(Thread, thread_id)
        if row is None:
            raise SessionNotFoundError(f"会话 {thread_id} 不存在")
        if row.status != "waiting_human":
            raise SessionConflictError("会话不在人工等待状态")
        return row

    def update_thread(
        self,
        thread_id: str,
        *,
        status: str | None = None,
        checkpoint_ns: str | None = None,
        pending_node_id: str | None = None,
        pending_question: str | None = None,
        final_output: str | None = None,
        clear_pending: bool = False,
    ) -> None:
        row = self.session.get(Thread, thread_id)
        if row is None:
            return
        if status is not None:
            row.status = status
        if checkpoint_ns is not None:
            row.checkpoint_ns = checkpoint_ns
        if pending_node_id is not None:
            row.pending_node_id = pending_node_id
        if pending_question is not None:
            row.pending_question = pending_question
        if final_output is not None:
            row.final_output = final_output
        if clear_pending:
            row.pending_node_id = None
            row.pending_question = None
        row.updated_at = _utc_now()
        self.session.commit()

    def touch_user_app(self, workflow_id: str, thread_id: str) -> None:
        app = self.session.query(UserApp).filter(UserApp.workflow_id == workflow_id).one_or_none()
        if app is None:
            return
        app.last_thread_id = thread_id
        self.session.commit()

    def add_message(
        self,
        *,
        thread_id: str,
        role: str,
        content: str,
        node_id: str | None = None,
    ) -> None:
        self.session.add(
            ThreadMessage(
                thread_id=thread_id,
                role=role,
                content=content,
                node_id=node_id,
                created_at=_utc_now(),
            )
        )
        self.session.commit()
