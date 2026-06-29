"""对话 API Pydantic 模型（PROTOCOL.md §3 / §4）。"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class ExecuteRequest(BaseModel):
    workflow_id: str
    thread_id: str
    input_text: str
    resume_data: Optional[dict[str, Any]] = None


class ResumeUserInput(BaseModel):
    confirmed: bool
    comment: Optional[str] = None


class ResumeRequest(BaseModel):
    thread_id: str
    checkpoint_ns: str
    user_input: ResumeUserInput
