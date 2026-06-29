"""Flask 启动入口：python run.py"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from app import create_app
from config import load_config


def main() -> None:
    cfg = load_config()
    app = create_app(cfg)
    app.run(host=cfg.HOST, port=cfg.PORT, debug=cfg.DEBUG)


if __name__ == "__main__":
    main()
