// ============================================================
// 聊天 UI 组件 — vanilla DOM 实现
// ============================================================
import { MarkdownRenderer } from "obsidian";
import type DeepSeekPlugin from "../../main";
import type { ChatMessage } from "../types";
import { DeepSeekError } from "../types";

export interface ChatViewCallbacks {
  onSend: (message: string) => Promise<void>;
}

/**
 * 聊天视图：负责消息渲染、输入交互、流式更新。
 * 不持有业务逻辑，通过 callbacks 与外部通信。
 */
export class ChatView {
  private container: HTMLElement;
  private messagesEl: HTMLElement;
  private inputAreaEl: HTMLElement;
  private contextBarEl: HTMLElement;
  private plugin: DeepSeekPlugin;

  private messages: ChatMessage[] = [];
  private isStreaming = false;
  private currentAssistantEl: HTMLElement | null = null;

  callbacks: ChatViewCallbacks = { onSend: async () => {} };

  constructor(container: HTMLElement, plugin: DeepSeekPlugin) {
    this.container = container;
    this.plugin = plugin;
    this.build();
  }

  // ---- DOM 构建 ----

  private build(): void {
    this.container.empty();
    this.container.addClass("deepseek-chat-container");

    // 上下文标签栏
    this.contextBarEl = this.container.createEl("div", {
      cls: "deepseek-context-bar",
    });
    this.updateContextLabel("未选择笔记");

    // 消息列表区域
    this.messagesEl = this.container.createEl("div", {
      cls: "deepseek-chat-messages",
    });

    // 错误提示区域（初始隐藏）
    const errorEl = this.container.createEl("div", {
      cls: "deepseek-error-bar",
      attr: { style: "display: none" },
    });

    // 输入区域
    this.inputAreaEl = this.container.createEl("div", {
      cls: "deepseek-chat-input-area",
    });

    const textarea = this.inputAreaEl.createEl("textarea", {
      cls: "deepseek-chat-input",
      attr: {
        placeholder: "输入消息... (Enter 发送, Shift+Enter 换行)",
        rows: "1",
      },
    });

    const sendBtn = this.inputAreaEl.createEl("button", {
      cls: "deepseek-chat-send-btn",
      text: "发送",
    });

    // 事件绑定
    textarea.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.handleSend(textarea);
      }
    });

    sendBtn.addEventListener("click", () => {
      this.handleSend(textarea);
    });

    // 自动调整 textarea 高度
    textarea.addEventListener("input", () => {
      textarea.style.height = "auto";
      textarea.style.height = textarea.scrollHeight + "px";
    });
  }

  // ---- 上下文 ----

  updateContextLabel(label: string): void {
    this.contextBarEl.empty();
    this.contextBarEl.createSpan({ cls: "context-icon", text: "📄" });
    this.contextBarEl.createSpan({
      text: `当前上下文：${label}`,
    });
  }

  // ---- 消息发送 ----

  private async handleSend(textarea: HTMLTextAreaElement): Promise<void> {
    const content = textarea.value.trim();
    if (!content || this.isStreaming) return;

    textarea.value = "";
    textarea.style.height = "auto";
    this.hideError();

    // 添加用户消息
    this.addMessage({ role: "user", content });
    this.messages.push({ role: "user", content });

    // 准备助手占位
    this.isStreaming = true;
    this.currentAssistantEl = this.createAssistantPlaceholder();

    try {
      await this.callbacks.onSend(content);
    } catch (err) {
      this.isStreaming = false;
      const errMsg =
        err instanceof DeepSeekError
          ? err.toUserMessage()
          : err instanceof Error
            ? err.message
            : "未知错误";
      this.showError(errMsg);
    }
  }

  // ---- 消息渲染 ----

  addMessage(msg: ChatMessage): HTMLElement {
    const el = this.messagesEl.createEl("div", {
      cls: `deepseek-message ${msg.role}`,
    });
    this.renderMarkdown(el, msg.content);
    this.scrollToBottom();
    return el;
  }

  /** 追加文本到当前助手气泡（流式更新） */
  appendToAssistant(delta: string, isComplete = false): void {
    if (!this.currentAssistantEl) return;
    // 清空并重新渲染完整内容以支持 Markdown
    this.currentAssistantEl.empty();
    // 累积到 messages 数组
    const lastMsg = this.messages[this.messages.length - 1];
    if (lastMsg && lastMsg.role === "assistant") {
      lastMsg.content += delta;
    }
    const fullContent = lastMsg?.content || delta;
    this.renderMarkdown(this.currentAssistantEl, fullContent);

    if (!isComplete) {
      this.currentAssistantEl.addClass("deepseek-streaming-cursor");
    } else {
      this.currentAssistantEl.removeClass("deepseek-streaming-cursor");
      this.isStreaming = false;
      this.currentAssistantEl = null;
    }
    this.scrollToBottom();
  }

  /** 流式结束时调用 */
  finalizeStreaming(): void {
    if (this.currentAssistantEl) {
      this.currentAssistantEl.removeClass("deepseek-streaming-cursor");
    }
    this.isStreaming = false;
    this.currentAssistantEl = null;
  }

  /** 创建助手占位气泡 */
  private createAssistantPlaceholder(): HTMLElement {
    const el = this.messagesEl.createEl("div", {
      cls: "deepseek-message assistant deepseek-streaming-cursor",
    });
    this.messages.push({ role: "assistant", content: "" });
    this.scrollToBottom();
    return el;
  }

  // ---- Markdown 渲染 ----

  private async renderMarkdown(
    container: HTMLElement,
    text: string,
  ): Promise<void> {
    await MarkdownRenderer.render(
      this.plugin.app,
      text,
      container,
      "",
      this.plugin,
    );
  }

  // ---- 错误处理 ----

  showError(message: string): void {
    // 查找或创建错误元素
    let errorEl = this.container.querySelector(
      ".deepseek-error-bar",
    ) as HTMLElement | null;
    if (!errorEl) {
      errorEl = this.container.createEl("div", { cls: "deepseek-error-bar" });
      this.container.insertBefore(errorEl, this.inputAreaEl);
    }
    errorEl.empty();
    errorEl.createSpan({ text: `⚠️ ${message}` });
    errorEl.style.display = "flex";
  }

  hideError(): void {
    const errorEl = this.container.querySelector(
      ".deepseek-error-bar",
    ) as HTMLElement | null;
    if (errorEl) {
      errorEl.style.display = "none";
    }
  }

  // ---- 工具方法 ----

  private scrollToBottom(): void {
    requestAnimationFrame(() => {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    });
  }

  /** 清空消息列表 */
  clear(): void {
    this.messages = [];
    this.messagesEl.empty();
    this.hideError();
    this.isStreaming = false;
    this.currentAssistantEl = null;
  }

  /** 添加助手消息（非流式） */
  addAssistantMessage(content: string): void {
    const msg: ChatMessage = { role: "assistant", content };
    this.messages.push(msg);
    this.addMessage(msg);
  }

  /** 暴露消息列表用于外部查询 */
  getMessages(): ChatMessage[] {
    return this.messages;
  }
}
