"""SQLAlchemy ORM 模型，与 schema.sql / IMPLEMENTATION_PLAN §4.2 对齐。"""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import ForeignKey, Index, Integer, Text, UniqueConstraint, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker


class Base(DeclarativeBase):
    pass


class Workflow(Base):
    __tablename__ = "workflows"

    workflow_id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False, default="未命名应用")
    description: Mapped[str | None] = mapped_column(Text)
    icon: Mapped[str | None] = mapped_column(Text)
    current_version: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str] = mapped_column(Text, nullable=False)

    versions: Mapped[list["WorkflowVersion"]] = relationship(back_populates="workflow")
    threads: Mapped[list["Thread"]] = relationship(back_populates="workflow")


class WorkflowVersion(Base):
    __tablename__ = "workflow_versions"
    __table_args__ = (
        UniqueConstraint("workflow_id", "version"),
        Index("idx_wv_workflow", "workflow_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workflow_id: Mapped[str] = mapped_column(ForeignKey("workflows.workflow_id"), nullable=False)
    version: Mapped[str] = mapped_column(Text, nullable=False)
    graph_spec_json: Mapped[str] = mapped_column(Text, nullable=False)
    is_major: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    base_version: Mapped[str | None] = mapped_column(Text)
    published_at: Mapped[str] = mapped_column(Text, nullable=False)

    workflow: Mapped["Workflow"] = relationship(back_populates="versions")


class WorkflowDraft(Base):
    __tablename__ = "workflow_drafts"

    workflow_id: Mapped[str] = mapped_column(ForeignKey("workflows.workflow_id"), primary_key=True)
    canvas_json: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str] = mapped_column(Text, nullable=False)


class Thread(Base):
    __tablename__ = "threads"
    __table_args__ = (
        Index("idx_threads_workflow", "workflow_id"),
        Index("idx_threads_status", "status"),
    )

    thread_id: Mapped[str] = mapped_column(Text, primary_key=True)
    workflow_id: Mapped[str] = mapped_column(ForeignKey("workflows.workflow_id"), nullable=False)
    workflow_version: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="running")
    checkpoint_ns: Mapped[str | None] = mapped_column(Text)
    pending_node_id: Mapped[str | None] = mapped_column(Text)
    pending_question: Mapped[str | None] = mapped_column(Text)
    final_output: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str] = mapped_column(Text, nullable=False)

    workflow: Mapped["Workflow"] = relationship(back_populates="threads")
    messages: Mapped[list["ThreadMessage"]] = relationship(back_populates="thread")


class ThreadMessage(Base):
    __tablename__ = "thread_messages"
    __table_args__ = (Index("idx_tm_thread", "thread_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    thread_id: Mapped[str] = mapped_column(ForeignKey("threads.thread_id"), nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    node_id: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)

    thread: Mapped["Thread"] = relationship(back_populates="messages")


class UserApp(Base):
    __tablename__ = "user_apps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workflow_id: Mapped[str] = mapped_column(ForeignKey("workflows.workflow_id"), nullable=False, unique=True)
    last_thread_id: Mapped[str | None] = mapped_column(ForeignKey("threads.thread_id"))
    added_at: Mapped[str] = mapped_column(Text, nullable=False)


_engine = None
SessionLocal = sessionmaker(autoflush=False, autocommit=False)


def get_engine(database_url: str):
    global _engine
    if _engine is None:
        _engine = create_engine(
            database_url,
            connect_args={"check_same_thread": False},
            future=True,
        )
    return _engine


def init_db(database_url: str) -> None:
    """启动时建表：执行 schema.sql 并 ensure ORM metadata。"""
    engine = get_engine(database_url)
    SessionLocal.configure(bind=engine)

    sql = Path(__file__).with_name("schema.sql").read_text(encoding="utf-8")
    with engine.begin() as conn:
        for statement in _split_sql_statements(sql):
            conn.exec_driver_sql(statement)
        Base.metadata.create_all(bind=conn)


def _split_sql_statements(sql: str) -> list[str]:
    """按分号拆分 DDL，跳过空语句与纯注释块。"""
    statements: list[str] = []
    for part in sql.split(";"):
        stmt = part.strip()
        if not stmt:
            continue
        lines = [line for line in stmt.splitlines() if line.strip() and not line.strip().startswith("--")]
        if lines:
            statements.append("\n".join(lines))
    return statements
