// ============================================================
// 共享类型定义
// ============================================================

/** API 消息格式 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  id?: string;
}

/** 脱敏规则定义 */
export interface SanitizerRule {
  id: string;
  name: string;
  regex: string;
  replacement: string;
  enabled: boolean;
}

/** 脱敏结果 */
export interface SanitizeOutput {
  sanitized: string;
  count: number;
}

/** 拆分后的笔记 */
export interface SplitNote {
  title: string;
  content: string;
  tags: string[];
}

/** 标签建议 */
export interface TagSuggestion {
  tag: string;
  confidence: number; // 0-1
  reason: string;
}

/** 链接建议 */
export interface LinkSuggestion {
  targetNote: string;
  snippet: string;
  reason: string;
}

/** 摘要样式 */
export type SummaryStyle = "concise" | "detailed" | "outline";

/** 润色模式 */
export type PolishMode = "improve" | "shorten" | "expand" | "fix-grammar";

/** 拆分粒度 */
export type SplitGranularity = "coarse" | "medium" | "fine";

/** 解析器接口 */
export interface Parser {
  parse(arrayBuffer: ArrayBuffer): Promise<string>;
}

/** DeepSeek API 错误 */
export class DeepSeekError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public rawBody?: string,
  ) {
    super(message);
    this.name = "DeepSeekError";
  }

  /** 中文化错误描述 */
  toUserMessage(): string {
    switch (this.statusCode) {
      case 401:
        return "API Key 无效，请检查设置中的 API Key 是否正确。";
      case 402:
        return "API 配额不足，请检查 DeepSeek 账户余额。";
      case 429:
        return "API 请求过于频繁，请稍后重试。";
      case 500:
        return "DeepSeek 服务器内部错误，请稍后重试。";
      case 503:
        return "DeepSeek 服务暂时不可用，请稍后重试。";
      default:
        if (this.statusCode >= 400 && this.statusCode < 500) {
          return `请求错误 (${this.statusCode})：${this.message}`;
        }
        return `服务器错误 (${this.statusCode})：${this.message}`;
    }
  }
}
