# SKILL.md — 工程规范与目录树

> 本文件约束 AI **如何写代码、文件放哪里**。与 `AGENT.md`（宪章边界）、`PROTOCOL.md`（接口契约）配合使用。
>
> **前提**：这是一个 Demo，不是生产级项目。规范服务于快速联调与清晰分层，不做过度抽象。

---

## 1. 强制目录结构（Monorepo 风格）

项目根目录**必须**严格遵循下列树状结构。AI 新增任何文件必须落入对应子文件夹，**严禁在根目录堆放业务脚本**（`docker-compose.yml` 及文档除外）。

```text
project-root/
├── .env.example                        # 【默认配置模板】全环境键名与占位值，提交 Git
├── backend/
│   ├── .env.example                    # 【默认配置模板】提交 Git
│   ├── .env                            # 【当前环境配置】不提交；由 APP_ENV 叠加加载
│   ├── requirements.txt
│   ├── run.py                          # 启动入口（python run.py）
│   ├── data/                           # zhihui.db、checkpoints.db
│   ├── tests/
│   └── src/
│       ├── app.py                      # Flask 应用工厂；启动时触发图校验
│       ├── config.py                   # 读取 APP_ENV，加载对应环境配置（§1.6）
│       ├── api/                        # Flask 路由薄层：参数解析 + JSON / SSE
│       │   ├── response.py             # 统一 { code, data, msg }
│       │   ├── routes_workflow.py      # 工作流 CRUD、发布、node-types
│       │   └── routes_chat.py          # POST /api/chat/{id} SSE 流式对话
│       ├── core/                       # LangGraph 核心引擎（api 不得直连）
│       │   ├── graph_builder.py        # 蓝图 JSON → StateGraph 编译 + validate_graph()
│       │   ├── state.py                # 全局 State Schema（见 §5 字段要求）
│       │   ├── checkpointer.py         # 初始化 SqliteSaver
│       │   └── runner.py               # stream_chat / resume 门面
│       ├── nodes/                      # 【核心】自定义节点实现
│       │   ├── base.py                 # 抽象基类 BaseNode（含 config 解析）
│       │   ├── registry.py             # 节点类型枚举与工厂映射
│       │   ├── router_node.py          # RouterNode：唯一分支收敛点（§7.1）
│       │   ├── llm_node.py             # AI 对话节点
│       │   ├── rag_node.py             # RAG 检索节点
│       │   ├── human_node.py           # 人工介入（触发 interrupt）
│       │   └── memory_node.py          # 记忆节点（占位 / 按需实现）
│       ├── repositories/               # 数据库 CRUD（SQLAlchemy）
│       │   ├── workflow_repo.py        # 工作流版本增删改查（已发布只读）
│       │   └── session_repo.py         # 会话与 checkpoint 映射
│       └── schemas/                    # Pydantic 请求/响应校验
│           ├── workflow.py
│           └── chat.py
│
├── frontend/
│   ├── .env.example                    # 【默认配置模板】VITE_* 键名说明，提交 Git
│   ├── .env                            # 【当前环境配置】本地生效，不提交
│   ├── package.json
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── pages/
│       │   ├── Playground/             # 【应用广场】已发布 Workflow 缩略卡片
│       │   ├── MyApps/                 # 【个人应用】已安装 / 使用中的卡片
│       │   └── Canvas/                 # 【编排画布】核心编辑页
│       ├── components/
│       │   ├── common/                 # 跨页面通用组件
│       │   └── Canvas/
│       │       ├── CustomNodes/        # 对应 nodes/registry 的 React 组件
│       │       │   └── index.ts        # nodeTypes 统一导出（强制）
│       │       ├── NodeConfigModal/    # 双击节点配置弹窗
│       │       └── ValidateBar/        # 单入口单出口校验 UI 提示
│       ├── stores/                     # Zustand（§5）
│       │   ├── workflowStore.ts        # 画布 nodes/edges、版本、校验态
│       │   └── chatStore.ts            # 对话历史、SSE、thread_id / session_id
│       ├── services/                   # API 封装（§4）
│       │   ├── workflowApi.ts
│       │   └── chatApi.ts              # fetch SSE / EventSource
│       ├── mocks/                      # Mock 先行（AGENT.md）；结构对齐 PROTOCOL.md
│       ├── types/                      # canvas.ts 等
│       ├── hooks/
│       └── utils/
│
├── docker-compose.yml                    # （可选）统一部署
├── AGENT.md
├── SKILL.md
├── PROTOCOL.md
└── IMPLEMENTATION_PLAN.md
```

### 1.1 文件落位规则

| 要新增的内容 | 必须放在 |
|--------------|----------|
| Flask 路由 | `api/routes_workflow.py` 或 `api/routes_chat.py` |
| JSON 响应封装 | `api/response.py` |
| 图编译与纯循环校验 | `core/graph_builder.py` → `validate_graph()` |
| State Schema | `core/state.py` |
| SqliteSaver | `core/checkpointer.py` |
| 流式执行门面 | `core/runner.py` |
| 节点注册表 | `nodes/registry.py` |
| Python 节点 | `nodes/<name>_node.py`，继承 `base.py` |
| 工作流 / 会话 CRUD | `repositories/workflow_repo.py`、`session_repo.py` |
| Pydantic 模型 | `schemas/workflow.py`、`schemas/chat.py` |
| 应用广场 | `pages/Playground/` |
| 个人应用 | `pages/MyApps/` |
| 编排画布 | `pages/Canvas/` |
| 画布节点 UI | `components/Canvas/CustomNodes/` + `index.ts` |
| 节点配置弹窗 | `components/Canvas/NodeConfigModal/` |
| 入口出口校验条 | `components/Canvas/ValidateBar/` |
| 工作流 API | `services/workflowApi.ts` |
| SSE 对话 API | `services/chatApi.ts` |
| Mock 数据 | `mocks/` |
| 后端环境配置加载 | `backend/src/config.py` + `backend/.env` |
| 前端环境配置 | `frontend/.env`（Vite 按 mode 叠加 `.env.development` 等） |

### 1.2 节点扩展（简要）

完整规范见 **§2 节点开发规范**。新增节点须同步更新 `registry.py` 的 `NODE_TYPE_MAP` 与前端 `CustomNodes/index.ts`。

### 1.3 画布节点组件（React）

新增组件**必须**在 `CustomNodes/` 下，并在 `index.ts` 导出：

```typescript
import { LLMNode } from './LLMNode';
import { RAGNode } from './RAGNode';
import { HumanNode } from './HumanNode';

export const customNodeTypes = {
  llm: LLMNode,
  rag: RAGNode,
  human: HumanNode,
  router: RouterNode,
  // 新增必须在此追加
};
```

禁止在 `pages/Canvas/` 内私有定义节点而不导出到 `index.ts`。

### 1.4 严禁行为

- 根目录临时脚本（`test.py`、`scratch/` 等）
- `api/` 内直接 `invoke` / `update_state` / 操作 checkpoint（须经 `core/runner.py`）
- 前后端业务代码混放、无关顶层目录私自创建
- 前端等后端空置画布；后端在 `api/` 写临时执行逻辑

### 1.5 测试

- 后端：`backend/tests/`；手动脚本：`backend/tests/manual/`
- 前端：`frontend/src/__tests__/`

### 1.6 环境配置文件（development / testing / production）

Monorepo 采用 **两个配置文件 + 环境变量** 模式，按 `APP_ENV`（后端）与 Vite `mode`（前端）切换 **开发、测试、生产**。

#### 两个核心文件（前后端各一对，结构相同）

| 文件 | 是否提交 Git | 职责 |
|------|--------------|------|
| **`.env.example`** | **是** | **默认配置模板**：列出全部键名、占位值与中文注释；不含真实密钥 |
| **`.env`** | **否** | **当前环境配置**：从 example 复制后填写；运行时实际加载 |

路径：

- 后端：`backend/.env.example`、`backend/.env`
- 前端：`frontend/.env.example`、`frontend/.env`
- 根目录：`project-root/.env.example`（可选，存放跨端公共变量如 `APP_ENV`）

#### 环境切换：`APP_ENV`

后端 `config.py` **必须**根据环境变量 `APP_ENV` 加载配置：

| `APP_ENV` | 含义 | 典型用途 |
|-----------|------|----------|
| `development` | 开发 | 本地 Flask、`DEBUG=true`、SQLite 默认路径 |
| `testing` | 测试 | 独立测试库、`MemorySaver` 或临时 DB |
| `production` | 生产 | Docker / 阿里云、`DEBUG=false`、严格日志 |

**加载顺序**（`config.py` 实现约定）：

1. 读取 `backend/.env.example` 中的默认值（仅作缺省，不覆盖已设变量）
2. 读取 `backend/.env`（本地覆盖）
3. 若存在 `backend/.env.{APP_ENV}`（如 `.env.development`），再叠加覆盖
4. 环境变量优先级最高

```bash
# 开发
APP_ENV=development python run.py

# 测试
APP_ENV=testing python -m pytest

# 生产（Docker）
APP_ENV=production python run.py
```

#### 前端（Vite）

Vite 按 **mode** 自动加载（与 `APP_ENV` 对齐命名）：

| 命令 | mode | 加载文件（优先级从低到高） |
|------|------|---------------------------|
| `npm run dev` | `development` | `.env` → `.env.development` |
| `npm run build` | `production` | `.env` → `.env.production` |
| `npm run test` / `vitest` | `testing` | `.env` → `.env.testing` |

前端 `.env.example` **必须**包含：

```bash
VITE_APP_ENV=development
VITE_API_BASE_URL=http://localhost:5000
VITE_USE_MOCK=true
```

#### 禁止行为

- 将含真实密钥的 `.env` 提交 Git
- 在代码中硬编码环境差异（数据库 URL、API Key）；须走配置文件
- 在根目录散落多个未命名的 `config.json` 替代 `.env` 体系

---

## 2. 节点开发规范（Backend）

### 2.1 BaseNode 抽象类

所有自定义节点**必须**继承 `nodes/base.py` 中的 `BaseNode`，并实现：

```python
def execute(self, state: WorkflowState, config: dict) -> WorkflowState:
    """由子类实现：读取 state 与节点 config，返回更新后的 state。"""
```

| 要求 | 说明 |
|------|------|
| 继承 | `class LlmNode(BaseNode):` |
| 入口方法 | **`execute(state, config)`** 为统一执行入口；`graph_builder` 只调此方法 |
| 配置来源 | `config` 来自画布 JSON 的 `data.config`（经 `BaseNode` 解析校验） |
| 职责边界 | 只写业务产出到 `state`（如 `messages`、`node_outputs`）；**禁止**在节点内硬编码分支跳转（见 §7.1 RouterNode） |

`BaseNode` 可提供共用方法（如 `parse_config`），但不得替代子类 `execute`。

### 2.2 `registry.py` 与 `NODE_TYPE_MAP`

`nodes/registry.py` **必须**维护 **`NODE_TYPE_MAP`** 字典，将前端传来的 `type` 字符串映射到 Python 类：

```python
from nodes.llm_node import LlmNode
from nodes.rag_node import RagNode
from nodes.human_node import HumanNode
from nodes.router_node import RouterNode

NODE_TYPE_MAP: dict[str, type[BaseNode]] = {
    "start": StartNode,
    "end": EndNode,
    "llm": LlmNode,
    "rag": RagNode,
    "human": HumanNode,
    "router": RouterNode,
    # 新增节点必须在此追加
}
```

**新增节点强制步骤**：

1. 实现 `nodes/<type>_node.py`，继承 `BaseNode`，实现 `execute(state, config)`
2. 在 **`NODE_TYPE_MAP`** 中注册 `"type"` → 类（**AI 必须同步更新此字典**）
3. `GET /api/node-types` 从 `NODE_TYPE_MAP` 生成列表，禁止手写重复枚举
4. 前端 `CustomNodes/` + `index.ts` 同步同名 `type`

禁止在 `api/`、`repositories/`、`graph_builder.py` 外使用 `if node_type == "rag"` 代替映射表。

---

## 3. 前端画布规范（Frontend）

### 3.1 React Flow 数据约束

前端保存 / 发布时，传给后端的 JSON（`POST /api/workflows`，见 `PROTOCOL.md`）**必须**包含：

**`nodes[]`（每一项强制）**

| 字段 | 说明 |
|------|------|
| `id` | 画布内唯一节点 ID |
| `type` | 与 `NODE_TYPE_MAP` 键一致，如 `llm`、`rag` |
| `position` | `{ x, number, y: number }` |
| `data.config` | 节点配置对象；无配置时传 `{}` |

**`edges[]`（每一项强制）**

| 字段 | 说明 |
|------|------|
| `id` | 连线唯一 ID |
| `source` | 源节点 `id` |
| `target` | 目标节点 `id` |

`workflowStore` 导出画布数据时须校验上述字段齐全；`mocks/workflows.ts` 结构须一致。

### 3.2 版本号展示

在 **应用广场**（`pages/Playground/`）与 **个人应用**（`pages/MyApps/`）的卡片上，**必须显式展示版本号**。

| 要求 | 说明 |
|------|------|
| 格式 | 语义化版本字符串，如 **`v1.2.0`**（来自 `workflows.version` 字段） |
| 位置 | 卡片标题旁或副标题，用户一眼可见 |
| Mock | `mocks/workflows.ts` 列表项须含 `version` 字段 |

禁止在广场 / 个人应用卡片隐藏版本或仅展示 `workflow_id`。

### 3.3 新建会话与继续会话

用户点击卡片 **「开始对话」** 时：

| 场景 | 行为 |
|------|------|
| **新建会话** | 前端生成 **`thread_id`**（UUID），随创建会话 / 对话请求传至后端；Demo 可同时作为 `session_id` |
| **继续会话** | 携带上次会话的 **`thread_id`**（及 `session_id`），后端从 Checkpointer 恢复 |

实现落位：

- `chatStore.ts`：区分 `isNewSession`；新建时 `crypto.randomUUID()` 生成 `thread_id`
- `chatApi.ts` / `routes_chat.py`：Body 携带 `session_id`；新建时 `thread_id` 由前端传入并写入 `sessions` 表
- 继续对话：`POST /api/chat/{workflow_id}` 使用已有 `session_id` + 对应 `thread_id` resume

禁止后端静默生成 `thread_id` 导致前端无法关联「继续会话」入口。

---

## 4. 后端统一错误处理范式

非 SSE 接口**必须**使用统一 JSON 包装。

```json
{ "code": 0, "data": {}, "msg": "ok" }
```

| code | 含义 | HTTP Status |
|------|------|-------------|
| `0` | 成功 | 200 |
| `1001` | 参数错误 | 400 |
| `1002` | 资源不存在 | 404 |
| `1003` | 业务冲突（如发布校验失败） | 409 |
| `5000` | 服务器错误 | 500 |

**实现要求**：

1. `api/response.py` 提供 `success()` / `fail()`；路由禁止裸 `jsonify`
2. `app.py` 全局异常 → `code=5000`
3. `routes_workflow.py` 调 `repositories/`；`routes_chat.py` 调 `core/runner.py` 输出 SSE
4. SSE 成功路径见 `PROTOCOL.md`；流建立前失败可返回 JSON 错误体

**前端**：`workflowApi.ts` 解析 `code`；`chatApi.ts` 解析 SSE 事件，不用 axios JSON 解析对话内容。

Mock：`VITE_USE_MOCK=true` 时从 `mocks/` 读取，结构对齐 `PROTOCOL.md`。

---

## 5. 前端状态管理（Zustand）

**唯一全局方案：Zustand。** 禁止 Redux、MobX、Jotai、Recoil 等。

| Store | 文件 | 职责 |
|-------|------|------|
| 画布与工作流 | `workflowStore.ts` | nodes、edges、workflowId、version、ValidateBar 状态 |
| 对话与 SSE | `chatStore.ts` | 消息列表、当前 session、SSE 连接中/断线、流式累加文本 |

| 状态类型 | 做法 |
|----------|------|
| 弹窗、表单临时值 | `useState` |
| 跨组件共享 | Zustand 或组件组合 |
| 服务端数据 | `services/` 拉取后写入 store |

React Context **仅**用于主题、`ConfigProvider` 等静态配置。

---

## 6. 注释密度控制

### 6.1 BaseNode 子类（强制）

每个 `BaseNode` 子类**必须在类级别**写**中文 Docstring**，说明：

- 节点业务功能
- `execute` 读写的 `state` 字段
- 与上下游节点（如 RAG → LLM）的关系

```python
class LlmNode(BaseNode):
    """AI 对话节点：读取 rag_context 与 messages，流式写入 assistant 消息。"""
```

### 6.2 行内注释（严格限制）

| 允许行内注释的位置 | 禁止 |
|-------------------|------|
| 复杂正则表达式 | 逐行翻译代码 |
| `graph_builder.py` 中 `add_conditional_edges` 路由逻辑 | 普通赋值、调用上的 `# 说明` |
| 同上两处以外的 **BaseNode 子类与 core/** | 大段教程式注释、废弃代码块 |

其余模块（`api/`、`stores/`、`CustomNodes/`）：关键函数用文档注释；行内注释**每文件 ≤ 3 处**（魔法数、临时 Demo 限制）。

```python
def validate_graph(canvas_json: dict) -> None:
    """校验单 start/end 与纯循环；失败 raise GraphValidationError。"""
```

```typescript
/**
 * 发布工作流：复制或递增 version；已发布记录只读（AGENT.md §3.4）。
 */
```

---

## 7. LangGraph 与画布铁律（强制）

### 7.1 RouterNode 约定

- 分支逻辑**只能**由 `nodes/router_node.py`（`type: router`）完成
- RouterNode **不执行业务**；只读 State，写 `next_node_id`
- `llm_node`、`rag_node`、`human_node` 等**禁止**硬编码 `goto` / 分支跳转

### 7.2 `config.routes` 字段

前端 `types/canvas.ts` 中，可分支节点 `data.config` **必须**含 `routes: string[]`（如 `["approved", "rejected"]`）。

- 自 `router` 出发的边：`sourceHandle` 必须匹配 `routes` 项
- `RouterNode` 根据 State 匹配出口名称
- `mocks/workflows.ts` 不得省略 `routes`

### 7.3 纯循环禁止（`graph_builder.validate_graph`）

1. `core/graph_builder.py` 实现 `validate_graph(canvas_json)`：拒绝无跳出条件的纯循环
2. **Flask 启动**与 **compile / publish / stream_chat 前**均须调用
3. 校验逻辑**不得**写在 `api/`

### 7.4 `core/state.py` 必选字段

全局 `WorkflowState` **必须**包含（与 `IMPLEMENTATION_PLAN.md` 一致并可扩展）：

| 字段 | 说明 |
|------|------|
| `messages` | 对话历史（`add_messages` 归并） |
| `human_response` | 人工确认后注入的文本 |
| `checkpoint_ns` | LangGraph checkpoint 命名空间 |
| `workflow_id` / `session_id` / `thread_id` | 会话关联 |
| `input_text` | 本轮 API 输入 |
| `node_outputs` | 各节点产出，供 Router 读取 |
| `session_status` | `running` \| `waiting_human` \| `completed` \| `failed` |

### 7.5 Checkpointer

`core/checkpointer.py` 初始化 **`SqliteSaver`**（`backend/data/checkpoints.db`）。Demo 默认禁止仅用 `MemorySaver`。

---

## 8. 与 AGENT.md 的衔接

生成代码前须完成 `AGENT.md`「决策说明」。本节与 §1–§7 **无需再次决策**。

| AGENT.md | SKILL.md 落位 |
|----------|---------------|
| StateGraph 唯一 | `core/graph_builder.py` + `core/runner.py` |
| 强制 Checkpointer | `core/checkpointer.py` |
| 单 start / end | `graph_builder.validate_graph` + `ValidateBar/` |
| 版本不可变 | `workflow_repo.py` |
| interrupt 人工介入 | `human_node.py` |
| Mock 先行 | `mocks/` + `VITE_USE_MOCK` |
| SSE 对话 | `routes_chat.py` + `chatApi.ts` |

### 代码生成自检清单

- [ ] 新文件落在 §1 目录树内；根目录无业务脚本
- [ ] `api/response.py` 统一 JSON；SSE 符合 `PROTOCOL.md`
- [ ] `api/` 未直连 LangGraph；经 `core/runner.py`
- [ ] 节点继承 `BaseNode` 且实现 `execute(state, config)`
- [ ] `NODE_TYPE_MAP` 已同步更新；`GET /api/node-types` 读注册表
- [ ] 保存 JSON 含 `nodes(id,type,position,data.config)` 与 `edges(id,source,target)`
- [ ] Playground / MyApps 卡片展示版本号（如 `v1.2.0`）
- [ ] 新建会话前端生成 `thread_id`；继续会话携带历史 `thread_id`
- [ ] `CustomNodes/index.ts` 已导出
- [ ] 分支仅在 `router_node`；`config.routes` 与 `sourceHandle` 对齐
- [ ] `validate_graph` 已启用（启动 + 运行前）
- [ ] `state.py` 含 `messages`、`human_response`、`checkpoint_ns`
- [ ] `SqliteSaver` 已配置
- [ ] `workflowStore` / `chatStore`；无 Redux
- [ ] Mock 可独立跑 Playground / Canvas
- [ ] `.env.example` 已更新；`.env` 未提交；`APP_ENV` 三环境可切换
- [ ] 每个 BaseNode 子类有中文类级 Docstring
- [ ] 行内注释仅用于正则 / `add_conditional_edges`；其余模块 ≤ 3 处/文件

---

*技术栈：React 18 + TypeScript + Vite + Ant Design + React Flow / Python + Flask + LangGraph + SQLite。*
