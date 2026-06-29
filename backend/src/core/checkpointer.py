"""SqliteSaver 初始化 — Demo 默认持久化 Checkpointer（AGENT.md §3.2）。"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from langgraph.checkpoint.sqlite import SqliteSaver

_saver: SqliteSaver | None = None


def init_checkpointer(db_path: str) -> SqliteSaver:
    """
    选择 SqliteSaver 而非 MemorySaver：支持会话重启续跑与 interrupt 断点。
    使用独立 sqlite3 连接，避免 from_conn_string 上下文退出后连接关闭。
    """
    global _saver
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    _saver = SqliteSaver(conn)
    return _saver


def get_checkpointer() -> SqliteSaver:
    if _saver is None:
        raise RuntimeError("Checkpointer 未初始化，请先调用 init_checkpointer()")
    return _saver
