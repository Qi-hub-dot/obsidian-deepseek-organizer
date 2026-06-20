// ============================================================
// DeepSeek 侧边栏 — ItemView 实现
// ============================================================
import { ItemView, WorkspaceLeaf, MarkdownView } from "obsidian";
import type DeepSeekPlugin from "../main";
import { ChatView } from "./ui/chat-view";
import { DeepSeekError } from "./types";

export const VIEW_TYPE_DEEPSEEK_CHAT = "deepseek-chat-sidebar";

export class DeepSeekSidebarView extends ItemView {
  plugin: DeepSeekPlugin;
  chatView!: ChatView;
  private currentNotePath = "";

  constructor(leaf: WorkspaceLeaf, plugin: DeepSeekPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_DEEPSEEK_CHAT;
  }

  getDisplayText(): string {
    return "DeepSeek 助手";
  }

  getIcon(): string {
    return "message-square";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();

    this.chatView = new ChatView(container, this.plugin);

    // 设置发送回调
    this.chatView.callbacks.onSend = async (userMessage: string) => {
      await this.handleChatSend(userMessage);
    };

    // 注册笔记切换监听
    this.registerEvent(
      this.plugin.app.workspace.on("active-leaf-change", () => {
        this.onActiveNoteChange();
      }),
    );

    // 初始上下文设置
    this.onActiveNoteChange();
  }

  async onClose(): Promise<void> {
    this.containerEl.children[1]?.empty();
  }

  // ---- 上下文注入 (Step 2.3) ----

  private onActiveNoteChange(): void {
    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    const newPath = view?.file?.path || "";

    if (newPath !== this.currentNotePath) {
      // 切换笔记 → 清空对话历史
      this.chatView.clear();
      this.currentNotePath = newPath;

      if (view?.file) {
        const fileName = view.file.basename;
        this.chatView.updateContextLabel(`${fileName} (${view.file.path})`);
      } else {
        this.chatView.updateContextLabel("未选择笔记");
      }
    }
  }

  /** 获取当前活跃笔记的内容 */
  private getCurrentNoteContent(): string | null {
    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return null;

    // 优先获取选中文本
    const selection = view.editor.getSelection();
    if (selection.trim()) return selection;

    // 否则返回全文
    return view.editor.getValue();
  }

  /** 获取当前活跃笔记的路径 */
  getCurrentNotePath(): string {
    return this.currentNotePath;
  }

  // ---- 聊天发送处理 ----

  private async handleChatSend(userMessage: string): Promise<void> {
    const effectiveKey = this.plugin.getEffectiveApiKey();
    if (!effectiveKey) {
      this.chatView.showError(
        "API Key 未配置。请在设置中填写 DeepSeek API Key，或设置环境变量 DEEPSEEK_API_KEY。",
      );
      return;
    }

    // 确保客户端配置最新
    this.plugin.apiClient.updateConfig(
      this.plugin.settings.baseUrl,
      effectiveKey,
      this.plugin.settings.model,
    );

    const noteContent = this.getCurrentNoteContent();

    // 构建消息列表
    const messages: Array<{ role: string; content: string }> = [];

    if (noteContent) {
      messages.push({
        role: "system",
        content: `你是一个知识管理助手，集成在 Obsidian 笔记软件中。当前活跃笔记的内容如下。用户可能会与你讨论这篇笔记，或请你对其进行操作（摘要、标签、链接、润色等）。\n\n--- 当前笔记内容 ---\n${noteContent}`,
      });
    } else {
      messages.push({
        role: "system",
        content:
          "你是一个知识管理助手，集成在 Obsidian 笔记软件中。帮助用户管理笔记、整理知识。",
      });
    }

    // 添加历史消息（最近 10 轮，约 20 条）
    const history = this.chatView.getMessages();
    const recentHistory = history.slice(-20);
    for (const msg of recentHistory) {
      messages.push(msg);
    }

    // 添加当前用户消息（已在历史中，这里是通过 history 传入）
    // 实际上用户消息已经在 messages 中了，不需要重复添加
    // 但 system prompt 后就是 history，而 history 的最后一条就是当前用户消息

    try {
      const result = await this.plugin.apiClient.chat(
        messages as import("./types").ChatMessage[],
        { stream: true },
      );

      const stream = result as AsyncGenerator<string, void, undefined>;

      for await (const delta of stream) {
        this.chatView.appendToAssistant(delta);
      }
      this.chatView.finalizeStreaming();
    } catch (err) {
      this.chatView.finalizeStreaming();
      const errMsg =
        err instanceof DeepSeekError
          ? err.toUserMessage()
          : err instanceof Error
            ? err.message
            : "请求失败，请检查网络连接和 API 配置。";
      this.chatView.showError(errMsg);
    }
  }

  // ---- 公开方法供给命令使用 ----

  /** 外部触发：在聊天面板展示消息 */
  showUserMessage(content: string): void {
    this.chatView.addMessage({ role: "user", content });
  }

  /** 外部触发：展示助手消息 */
  showAssistantMessage(content: string): void {
    this.chatView.addAssistantMessage(content);
  }
}
