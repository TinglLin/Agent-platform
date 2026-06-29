"""环境配置：按 APP_ENV 叠加 .env.example → .env → .env.{APP_ENV}。"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"


@dataclass(frozen=True)
class AppConfig:
    """运行时配置快照。"""

    APP_ENV: str
    DEBUG: bool
    HOST: str
    PORT: int
    DATABASE_URL: str
    CHECKPOINT_DB_PATH: str
    DEEPSEEK_API_KEY: str
    LLM_MODEL: str


def _resolve_sqlite_url(raw: str) -> str:
    """将相对 sqlite 路径解析为绝对路径，避免 cwd 变化导致找不到库文件。"""
    if raw.startswith("sqlite:///") and not raw.startswith("sqlite:////"):
        rel = raw.removeprefix("sqlite:///")
        if rel != ":memory:" and not Path(rel).is_absolute():
            return f"sqlite:///{(BACKEND_DIR / rel).as_posix()}"
    return raw


def load_config() -> AppConfig:
    """
    加载顺序（SKILL.md §1.6）：
    1. .env.example（缺省，不覆盖已设变量）
    2. .env（本地覆盖）
    3. .env.{APP_ENV}（环境专用）
    4. 进程环境变量优先级最高
    """
    load_dotenv(BACKEND_DIR / ".env.example", override=False)
    load_dotenv(BACKEND_DIR / ".env", override=True)

    app_env = os.getenv("APP_ENV", "development")
    env_specific = BACKEND_DIR / f".env.{app_env}"
    if env_specific.exists():
        load_dotenv(env_specific, override=True)

    data_dir = DATA_DIR
    data_dir.mkdir(parents=True, exist_ok=True)

    default_db = f"sqlite:///{(data_dir / 'zhihui.db').as_posix()}"
    default_ckpt = str(data_dir / "checkpoints.db")

    return AppConfig(
        APP_ENV=app_env,
        DEBUG=os.getenv("DEBUG", "true").lower() in ("1", "true", "yes"),
        HOST=os.getenv("HOST", "0.0.0.0"),
        PORT=int(os.getenv("PORT", "5000")),
        DATABASE_URL=_resolve_sqlite_url(os.getenv("DATABASE_URL", default_db)),
        CHECKPOINT_DB_PATH=os.getenv("CHECKPOINT_DB_PATH", default_ckpt),
        DEEPSEEK_API_KEY=os.getenv("DEEPSEEK_API_KEY") or "",
        LLM_MODEL=os.getenv("LLM_MODEL", "deepseek-chat"),
    )
