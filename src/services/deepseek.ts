import type { AIConfig } from "../types";
import { DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL } from "../types";

/**
 * DeepSeek API 客户端（浏览器直连，DeepSeek 接口已开放 CORS）。
 *
 * 注意：这是本地演示版本的实现，API Key 保存在浏览器 localStorage 中，
 * 只应使用你自己的 Key；正式产品必须改为经由服务端代理调用。
 */

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

const trimBase = (base: string) =>
  (base.trim() || DEFAULT_AI_BASE_URL).replace(/\/+$/, "");

/**
 * 带超时的请求。
 * 没有超时的话，网络卡住时 fetch 会一直挂着：界面停在「发送中」出不来，
 * 用户既等不到结果也点不到「重试这条」。这里统一起一个上限，超时就当成失败处理。
 */
const TIMEOUT_UNSET = 15_000;
const TIMEOUT_CHAT = 60_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    // 用户主动取消（如页面卸载）时原样抛出；其余统一给出可读提示
    if (controller.signal.aborted)
      throw new Error(
        `请求超过 ${Math.round(timeoutMs / 1000)} 秒没有响应，已停止。请检查网络后重试。`,
      );
    if (e instanceof Error && e.name === "AbortError") throw e;
    throw new Error("网络请求失败，请检查网络连接后重试。");
  } finally {
    clearTimeout(timer);
  }
}

const friendlyError = (status: number, body: string) => {
  if (status === 401) return "API Key 无效或已过期（401），请检查后重试。";
  if (status === 402) return "DeepSeek 账户余额不足（402）。";
  if (status === 429) return "请求过于频繁，请稍后再试（429）。";
  if (status >= 500) return `DeepSeek 服务暂时不可用（${status}），请稍后重试。`;
  return `DeepSeek 接口返回 HTTP ${status}${body ? `：${body.slice(0, 120)}` : ""}`;
};

const errorFromBody = (status: number, body: string) =>
  new Error(friendlyError(status, body));

const readError = async (status: number, res: Response) =>
  errorFromBody(status, await res.text().catch(() => ""));

/** 连接检测：调用 /models 验证 Key 是否可用（用于红绿灯） */
export async function testDeepSeek(ai: AIConfig) {
  const res = await fetchWithTimeout(
    `${trimBase(ai.baseUrl)}/models`,
    { headers: { Authorization: `Bearer ${ai.apiKey.trim()}` } },
    TIMEOUT_UNSET,
  );
  if (!res.ok) throw await readError(res.status, res);
}

/** 一次对话补全，返回回复文本 */
export async function deepseekChat(
  ai: AIConfig,
  messages: ChatTurn[],
  maxTokens = 500,
): Promise<string> {
  const res = await fetchWithTimeout(
    `${trimBase(ai.baseUrl)}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ai.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: ai.model.trim() || DEFAULT_AI_MODEL,
        messages,
        temperature: 0.6,
        max_tokens: maxTokens,
      }),
    },
    TIMEOUT_CHAT,
  );
  if (!res.ok) throw await readError(res.status, res);
  const data = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: unknown } }[];
  } | null;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim())
    throw new Error("DeepSeek 没有返回内容，请重试。");
  return content.trim();
}

/** 去掉模型偶尔包上的 ```json 代码围栏 */
const stripFences = (value: string) =>
  value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

/**
 * 结构化调用：让模型输出（并解析）JSON 指令。
 * 优先使用 response_format: json_object；个别模型不支持时自动降级为纯提示词约束。
 */
export async function deepseekJson(
  ai: AIConfig,
  messages: ChatTurn[],
  maxTokens = 700,
): Promise<unknown> {
  const request = (jsonMode: boolean) =>
    fetchWithTimeout(
      `${trimBase(ai.baseUrl)}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ai.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: ai.model.trim() || DEFAULT_AI_MODEL,
          messages,
          temperature: 0.3,
          max_tokens: maxTokens,
          ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
      },
      TIMEOUT_CHAT,
    );
  let res = await request(true);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 400 && /response_format/i.test(body)) {
      res = await request(false);
      if (!res.ok)
        throw errorFromBody(res.status, await res.text().catch(() => ""));
    } else {
      throw errorFromBody(res.status, body);
    }
  }
  const data = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: unknown } }[];
  } | null;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim())
    throw new Error("DeepSeek 没有返回内容，请重试。");
  try {
    return JSON.parse(stripFences(content));
  } catch {
    throw new Error("AI 返回的 JSON 无法解析，请重试。");
  }
}
