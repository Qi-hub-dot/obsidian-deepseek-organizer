// ============================================================
// DeepSeek API 客户端 —— OpenAI 兼容端点
// ============================================================
import type { ChatMessage } from "./types";
import { DeepSeekError } from "./types";

export interface ChatOptions {
  stream?: boolean;
  signal?: AbortSignal;
}

export class DeepSeekClient {
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor(baseUrl: string, apiKey: string, model: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.model = model;
  }

  /** 更新配置（runtime 热更新用） */
  updateConfig(baseUrl: string, apiKey: string, model: string): void {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * 发起聊天完成请求。
   * stream=false → 返回完整响应字符串
   * stream=true  → 返回 AsyncGenerator，逐 token yield delta 文本
   */
  async chat(
    messages: ChatMessage[],
    options: ChatOptions = {},
  ): Promise<string | AsyncGenerator<string, void, undefined>> {
    const { stream = false, signal } = options;

    const body = JSON.stringify({
      model: this.model,
      messages,
      stream,
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers,
        body,
        signal,
      });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new DeepSeekError(0, "请求已超时");
      }
      const message = err instanceof Error ? err.message : "网络连接失败";
      throw new DeepSeekError(0, message);
    }

    if (!response.ok) {
      let errorMsg = `HTTP ${response.status}`;
      let rawBody = "";
      try {
        rawBody = await response.text();
        const parsed = JSON.parse(rawBody);
        errorMsg = parsed.error?.message || errorMsg;
      } catch {
        // ignore parse failure
      }
      throw new DeepSeekError(response.status, errorMsg, rawBody);
    }

    if (stream) {
      return this.streamResponse(response);
    }

    const json = await response.json();
    return json.choices?.[0]?.message?.content || "";
  }

  /** 流式迭代器 */
  private async *streamResponse(
    response: Response,
  ): AsyncGenerator<string, void, undefined> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new DeepSeekError(0, "无法读取响应流");
    }

    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // 保留最后一个不完整行
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6);
          if (data === "[DONE]") return;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) yield delta;
          } catch {
            // 跳过非 JSON 行
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
