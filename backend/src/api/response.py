"""统一 JSON 响应封装（SKILL.md §4 / PROTOCOL.md）。"""

from __future__ import annotations

from typing import Any

from flask import jsonify


def success(data: Any = None, msg: str = "ok", http_status: int = 200):
    return jsonify({"code": 0, "data": data if data is not None else {}, "msg": msg}), http_status


def fail(code: int, msg: str, http_status: int | None = None, data: Any = None):
    status_map = {
        1001: 400,
        1002: 404,
        1003: 409,
        5000: 500,
    }
    status = http_status if http_status is not None else status_map.get(code, 400)
    return jsonify({"code": code, "data": data if data is not None else {}, "msg": msg}), status
