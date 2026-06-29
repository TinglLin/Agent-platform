"""AI 对话节点：调用 DeepSeek API（OpenAI 兼容协议）。"""

from __future__ import annotations

import os
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage
from langchain_openai import ChatOpenAI

from core.state import WorkflowState
from nodes.base import BaseNode


class LlmNode(BaseNode):
    """AI 对话节点：调用 DeepSeek 模型，支持上下文与 RAG 上下文拼接。"""

    def execute(self, state: WorkflowState, config: dict[str, Any]) -> dict[str, Any]:
        cfg = self.parse_config(config)
        node_id = self.node_id(config)

        api_key = os.getenv("DEEPSEEK_API_KEY") or ""
        model = cfg.get("model") or os.getenv("LLM_MODEL", "deepseek-chat")
        prompt = str(cfg.get("prompt") or "你是智能助手，请根据上下文回答用户问题。")
        user_text = state.get("input_text") or ""
        rag = state.get("rag_context") or ""
        history = state.get("messages") or []

        if not api_key:
            return {
                "messages": [AIMessage(content="[错误] 未配置 DEEPSEEK_API_KEY，请在 backend/.env 中设置")],
                "node_outputs": {node_id: "[错误] 未配置 API Key"},
            }

        llm = ChatOpenAI(
            model=model,
            api_key=api_key,
            base_url="https://api.deepseek.com/v1",
            temperature=0.7,
            max_tokens=2048,
        )

        # 构建消息列表
        messages = []

        # 系统提示
        system_prompt = prompt
        if rag:
            system_prompt += f"\n\n参考上下文：\n{rag}"
        messages.append(("system", system_prompt))

        # 历史消息（保留最近 10 轮）
        for msg in history[-20:]:
            if isinstance(msg, HumanMessage):
                messages.append(("human", msg.content))
            elif isinstance(msg, AIMessage):
                messages.append(("assistant", msg.content))

        # 当前用户输入
        if user_text:
            messages.append(("human", user_text))

        try:
            response = llm.invoke(messages)
            content = response.content if hasattr(response, "content") else str(response)

            return {
                "messages": [AIMessage(content=content)],
                "node_outputs": {node_id: content},
            }
        except Exception as e:
            error_msg = f"[LLM 调用失败] {str(e)}"
            return {
                "messages": [AIMessage(content=error_msg)],
                "node_outputs": {node_id: error_msg},
            }
