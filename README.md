# 知汇平台 Demo

低代码 AI 编排 + LangGraph 对话执行 Demo（非生产项目）。

## 本地开发

### 后端

```bash
cd backend
copy .env.example .env
..\ .venv\Scripts\python.exe run.py
# http://127.0.0.1:5000/api/health
```

### 前端

```bash
cd frontend
copy .env.example .env
npm install
npm run dev
# http://localhost:5173
```

`VITE_USE_MOCK=true` 时可独立开发画布；联调时设为 `false`。

## Docker 部署

```bash
docker compose up --build -d
```

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:8080 |
| 后端 API | http://localhost:5000/api/health |

数据持久化在 Docker volume `zhihui-data`（SQLite + Checkpointer）。

## 页面

| 路径 | 说明 |
|------|------|
| `/playground` | 应用广场 |
| `/my-apps` | 我的应用（继续会话） |
| `/canvas` | 编排画布 |
| `/chat/:workflowId` | SSE 对话 |

## 测试

```bash
.\.venv\Scripts\python.exe -m pytest backend\tests\ -v
```
