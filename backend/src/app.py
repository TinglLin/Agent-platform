"""Flask 应用工厂。"""

from __future__ import annotations

from flask import Flask
from flask_cors import CORS

from api.response import fail
from api.routes_chat import chat_bp
from api.routes_workflow import workflow_bp
from config import AppConfig
from core.checkpointer import init_checkpointer
from core.graph_builder import STARTUP_CANONICAL_GRAPH, validate_graph
from repositories.db import init_db


def create_app(cfg: AppConfig | None = None) -> Flask:
    if cfg is None:
        from config import load_config

        cfg = load_config()

    app = Flask(__name__)
    app.config["APP_CONFIG"] = cfg
    app.config["DEBUG"] = cfg.DEBUG

    CORS(app, resources={r"/api/*": {"origins": "*"}})

    init_db(cfg.DATABASE_URL)
    init_checkpointer(cfg.CHECKPOINT_DB_PATH)
    validate_graph(STARTUP_CANONICAL_GRAPH)

    app.register_blueprint(workflow_bp)
    app.register_blueprint(chat_bp)

    @app.errorhandler(Exception)
    def handle_unexpected_error(err):
        if cfg.DEBUG:
            return fail(5000, f"{type(err).__name__}: {err}", http_status=500)
        return fail(5000, "服务器内部错误", http_status=500)

    return app
