// ============================================================
// DeepSeek API 客户端 —— OpenAI 兼容端点
// ============================================================
import type { ChatMessage } from "./types";
import { DeepSeekError } from "./types";

export interface ChatOptions {
  stream?: boolean;
  signal?: AbortSignal;
  maxTokens?: number;
  stop?: string[];
  topP?: number;
  /** V4 Pro reasoning content callback */
  onReasoning?: (chunk: string) => void;
}

export class DeepSeekClient {
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private reasoningEffort: string;
  private _reasoningCb: ((chunk: string) => void) | null = null;

  constructor(baseUrl: string, apiKey: string, model: string, reasoningEffort = "medium") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.model = model;
    this.reasoningEffort = reasoningEffort;
  }

  /** 更新配置（runtime 热更新用） */
  updateConfig(baseUrl: string, apiKey: string, model: string, reasoningEffort?: string): void {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.model = model;
    if (reasoningEffort) this.reasoningEffort = reasoningEffort;
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
    const { stream = false, signal, maxTokens, stop, topP } = options;

    const isReasoner = this.model === "deepseek-reasoner";
    const body = JSON.stringify({
      model: this.model,
      messages,
      stream,
      // DeepSeek 不支持 frequency_penalty/presence_penalty（会被静默忽略）
      // 使用 DeepSeek 原生参数：top_p + top_k 防止重复
      ...(isReasoner
        ? { reasoning_effort: this.reasoningEffort }
        : { temperature: 0.7, top_p: topP ?? 0.9, top_k: 40 }),
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      ...(stop ? { stop } : {}),
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
      this._reasoningCb = options.onReasoning || null;
      return this.streamResponse(response);
    }

    const json = await response.json();
    return json.choices?.[0]?.message?.content || "";
  }

  /** 流式迭代器 —— 单遍扫描，避免 split 分配数组 */
  private async *streamResponse(
    response: Response,
  ): AsyncGenerator<string, void, undefined> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new DeepSeekError(0, "无法读取响应流");
    }

    const decoder = new TextDecoder("utf-8");
    let buf = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });

        // 单遍扫描完整行，避免 split + pop 的数组分配
        let start = 0;
        let end: number;
        while ((end = buf.indexOf("\n", start)) !== -1) {
          let line = buf.slice(start, end);
          start = end + 1;

          // 快速预过滤：至少以 'd' 开头才是可能的 data: 行
          if (line.length < 7 || line.charCodeAt(0) !== 100) continue;

          line = line.trim();
          if (!line.startsWith("data: ")) continue;

          const data = line.slice(6);
          if (data === "[DONE]") {
            reader.releaseLock();
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.reasoning_content && this._reasoningCb) {
              this._reasoningCb(delta.reasoning_content);
            }
            if (delta?.content) yield delta.content;
          } catch {
            // 跳过非 JSON 行
          }
        }
        buf = buf.slice(start);
      }
    } finally {
      reader.releaseLock();
    }
  }
}
