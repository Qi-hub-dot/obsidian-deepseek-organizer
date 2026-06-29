// ============================================================
// DeepSeekSidebarView — React-powered sidebar (replaces vanilla DOM)
// ============================================================
import { ItemView, WorkspaceLeaf, MarkdownView, Notice, TFile } from "obsidian";
import type DeepSeekPlugin from "../main";
import { VIEW_TYPE_DEEPSEEK_CHAT } from "./constants";
import type { ChatMessage } from "./types";
import { createReactRoot } from "./utils/createRoot";
import { Chat } from "./ui/Chat";
import { getParserForFile } from "./parsers/index";
import type { Root } from "react-dom/client";
import React from "react";

export { VIEW_TYPE_DEEPSEEK_CHAT } from "./constants";

export class DeepSeekSidebarView extends ItemView {
  plugin: DeepSeekPlugin;
  private root: Root | null = null;
  private messages: ChatMessage[] = [];
  private currentNotePath = "";
  private currentNoteName: string | null = null;
  private attachedContent: string | null = null;
  private attachedName: string | null = null;
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private cachedSystemPrompt = "";
  private modelMode: "chat" | "reasoner" = "chat";

  constructor(leaf: WorkspaceLeaf, plugin: DeepSeekPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_DEEPSEEK_CHAT;
  }

  getDisplayText(): string {
    return "DeepSeek AI 助手";
  }

  getIcon(): string {
    return "message-square";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    this.root = createReactRoot(container);

    // Determine model mode from settings
    this.modelMode =
      this.plugin.settings.model === "deepseek-reasoner"
        ? "reasoner"
        : "chat";

    // Track active note changes
    this.registerEvent(
      this.plugin.app.workspace.on(
        "active-leaf-change",
        () => this.handleActiveNoteChange(),
      ),
    );

    // Initial render
    this.handleActiveNoteChange();
    this.renderChat();
  }

  async onClose(): Promise<void> {
    this.persistCurrentConversation();
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
  }

  // ---- Public API ----

  /** Get current messages */
  getMessages(): ChatMessage[] {
    return this.messages;
  }

  /** Set messages (for conversation loading) */
  setMessages(msgs: ChatMessage[]): void {
    this.messages = msgs;
    this.renderChat();
  }

  /** Prepend assistant message (for initial hints) */
  showAssistantMessage(content: string): void {
    this.messages.push({ role: "assistant", content });
    this.renderChat();
  }

  /** Show user message */
  showUserMessage(content: string): void {
    this.messages.push({ role: "user", content });
    this.renderChat();
  }

  /** Create Canvas from content */
  async createCanvasFromContent(content: string): Promise<void> {
    const activeFile = this.plugin.app.workspace.getActiveFile();
    const sourceName = activeFile?.basename || this.currentNoteName || "知识图谱";

    this.messages.push({
      role: "user",
      content: `请根据以下内容生成知识图谱：\n\n${content.slice(0, 5000)}`,
    });
    this.renderChat();

    // Trigger AI to generate canvas JSON
    const effectiveKey = this.plugin.getEffectiveApiKey();
    if (!effectiveKey) {
      this.messages.push({
        role: "assistant",
        content: "API Key 未配置，请先在设置中填写。",
      });
      this.renderChat();
      return;
    }

    this.plugin.apiClient.updateConfig(
      this.plugin.settings.baseUrl,
      effectiveKey,
      this.plugin.settings.model,
      this.plugin.settings.reasoningEffort,
    );

    const canvasPrompt = getCanvasPrompt(content, sourceName);
    try {
      const result = (await this.plugin.apiClient.chat(canvasPrompt, {
        stream: false,
        maxTokens: 4096,
      })) as string;

      // Try to parse canvasjson from response
      const jsonMatch = result.match(/```canvasjson\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        const canvasData = JSON.parse(jsonMatch[1]);
        const canvasPath = `${sourceName}_graph.canvas`;
        await this.plugin.app.vault.create(
          canvasPath,
          JSON.stringify(canvasData, null, 2),
        );
        this.messages.push({
          role: "assistant",
          content: `✅ 知识图谱已生成：[[${sourceName}_graph]]`,
        });
      } else {
        this.messages.push({
          role: "assistant",
          content:
            "已分析内容，但未能生成知识图谱结构。请尝试更具体地描述你要整理的知识点。\n\n分析结果：\n" +
            result.slice(0, 1000),
        });
      }
    } catch (err) {
      this.messages.push({
        role: "assistant",
        content:
          "生成失败：" +
          (err instanceof Error ? err.message : "未知错误"),
      });
    }
    this.renderChat();
  }

  /** Inline polish — replaces selection with polished text */
  async inlinePolish(): Promise<void> {
    const sel = this.getEditorSelection();
    if (!sel) {
      new Notice("请先选中要润色的文本");
      return;
    }
    new Notice("正在润色...");
    try {
      const result = (await this.plugin.apiClient.chat(
        [
          {
            role: "system",
            content:
              "请润色以下文本，使其更流畅、专业、有表达力。保持原意不变。直接输出润色后的文本，不要加解释。",
          },
          { role: "user", content: sel.text.slice(0, 4000) },
        ],
        { stream: false, maxTokens: 4096 },
      )) as string;
      if (result.trim()) {
        sel.editor.replaceSelection(result.trim());
        new Notice("已润色");
      }
    } catch (err) {
      new Notice(
        "润色失败：" +
          (err instanceof Error ? err.message : "未知错误"),
      );
    }
  }

  /** Inline explain — replaces selection with explanation */
  async inlineExplain(): Promise<void> {
    const sel = this.getEditorSelection();
    if (!sel) {
      new Notice("请先选中要讲解的文本");
      return;
    }
    new Notice("正在分析...");
    try {
      const result = (await this.plugin.apiClient.chat(
        [
          {
            role: "system",
            content:
              "请用中文解释以下选中的文本，带有清晰的结构和例子。输出格式：> 原文：引用原文\n\n## 解释\n...",
          },
          { role: "user", content: sel.text.slice(0, 3000) },
        ],
        { stream: false, maxTokens: 4096 },
      )) as string;
      if (result.trim()) {
        sel.editor.replaceSelection(result.trim());
        new Notice("已讲解");
      }
    } catch (err) {
      new Notice(
        "讲解失败：" +
          (err instanceof Error ? err.message : "未知错误"),
      );
    }
  }

  // ---- Private ----

  private handleActiveNoteChange(): void {
    const view =
      this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    const newPath = view?.file?.path || "";
    const newName = view?.file?.basename || null;

    if (newPath !== this.currentNotePath) {
      this.persistCurrentConversation();
      this.currentNotePath = newPath;
      this.currentNoteName = newName;
      this.messages = [];
      this.attachedContent = null;
      this.attachedName = null;

      // Load saved conversation for this note
      if (
        newPath &&
        this.plugin.settings.conversations[newPath]
      ) {
        this.messages = [
          ...this.plugin.settings.conversations[newPath],
        ];
      }
      this.renderChat();
    }
  }

  private persistCurrentConversation(): void {
    if (!this.currentNotePath) return;
    if (this.messages.length === 0) {
      delete this.plugin.settings.conversations[
        this.currentNotePath
      ];
      return;
    }
    this.plugin.settings.conversations[this.currentNotePath] = [
      ...this.messages.slice(-30),
    ];

    // Extract memory
    if (
      this.plugin.settings.memoryEnabled &&
      this.plugin.memory
    ) {
      this.extractMemory();
    }

    // Debounced save
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(async () => {
      await this.plugin.saveSettings();
    }, 500);
  }

  private extractMemory(): void {
    const userMsgs = this.messages.filter(
      (m) => m.role === "user" && m.content.trim(),
    );
    const assistantMsgs = this.messages.filter(
      (m) => m.role === "assistant" && m.content.trim(),
    );
    if (userMsgs.length < 2) return;

    this.plugin.memory
      .extractFromConversation(
        this.currentNotePath,
        userMsgs.map((m) => m.content),
        assistantMsgs.map((m) => m.content),
      )
      .catch((e: Error) =>
        console.error("[Memory] extract fail:", e),
      );
  }

  private renderChat(): void {
    if (!this.root) return;

    // Build available providers list
    const allProviders = this.plugin.modelManager.getProviders();
    const providerLabels: Record<string, string> = {
      deepseek: "🚀 DeepSeek (默认)",
      qwen: "🟠 通义千问",
      glm: "🔵 智谱 GLM",
      ollama: "🦙 Ollama (本地)",
    };
    const availableProviders = allProviders.map((id) => ({
      id,
      label: providerLabels[id] || id,
    }));

    this.root.render(
      React.createElement(Chat, {
        plugin: this.plugin,
        initialMessages: this.messages,
        notePath: this.currentNotePath,
        noteName: this.currentNoteName,
        onMessagesChange: (msgs: ChatMessage[]) => {
          this.messages = msgs;
          this.persistCurrentConversation();
        },
        onNewConversation: () => {
          this.messages = [];
          delete this.plugin.settings.conversations[this.currentNotePath];
          this.renderChat();
        },
        modelMode: this.modelMode,
        onModelModeChange: async (mode: "chat" | "reasoner") => {
          this.modelMode = mode;
          this.plugin.settings.model = mode === "reasoner" ? "deepseek-reasoner" : "deepseek-chat";
          await this.plugin.saveSettings();
          const key = this.plugin.getEffectiveApiKey();
          this.plugin.apiClient.updateConfig(this.plugin.settings.baseUrl, key, this.plugin.settings.model, this.plugin.settings.reasoningEffort);
          this.plugin.modelManager.updateDeepSeekConfig(this.plugin.settings.baseUrl, key, this.plugin.settings.model, this.plugin.settings.reasoningEffort);
          this.renderChat();
          new Notice(mode === "reasoner" ? "V4 Pro" : "V4 Flash");
        },
        activeProvider: this.plugin.settings.activeProvider,
        availableProviders,
        onProviderChange: async (provider: string) => {
          this.plugin.settings.activeProvider = provider;
          await this.plugin.saveSettings();
          this.renderChat();
        },
        chatHistoryItems: (this.plugin.chatPersistence?.getSavedConversations?.() || []).map((c: any) => ({ id: c.path, title: c.topic, date: c.date })),
        callbacks: {
          onSaveNote: async (content: string) => this.saveContentAsNote(content),
          onCreateCanvas: async (content: string) => { await this.createCanvasFromMessage(content); },
          onNewChat: () => { this.messages = []; this.renderChat(); },
        },
      }),
    );
  }

  private async saveContentAsNote(
    content: string,
  ): Promise<string | null> {
    try {
      const folder = this.plugin.settings.defaultTargetFolder || "";
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title =
        titleMatch?.[1]?.trim() ||
        "AI 生成的笔记 " +
          new Date().toISOString().slice(0, 10);
      const safeName = title
        .replace(/[\\/:*?"<>|#^\[\]]/g, "")
        .slice(0, 200);

      let filePath = `${folder}/${safeName}.md`;
      let counter = 1;
      while (
        this.plugin.app.vault.getAbstractFileByPath(filePath)
      ) {
        filePath = `${folder}/${safeName} (${counter}).md`;
        counter++;
      }

      // Ensure folder exists
      const parts = folder.split("/").filter(Boolean);
      let current = "";
      for (const part of parts) {
        current += part + "/";
        if (
          !this.plugin.app.vault.getAbstractFileByPath(
            current.slice(0, -1),
          )
        ) {
          await this.plugin.app.vault.createFolder(
            current.slice(0, -1),
          );
        }
      }

      await this.plugin.app.vault.create(filePath, content);
      return filePath;
    } catch (err) {
      console.error("Save note failed:", err);
      return null;
    }
  }

  private async createCanvasFromMessage(
    content: string,
  ): Promise<void> {
    const sourceName =
      this.currentNoteName || "知识图谱";
    const canvasPrompt = getCanvasPrompt(content, sourceName);

    const effectiveKey = this.plugin.getEffectiveApiKey();
    if (!effectiveKey) return;

    this.plugin.apiClient.updateConfig(
      this.plugin.settings.baseUrl,
      effectiveKey,
      this.plugin.settings.model,
      this.plugin.settings.reasoningEffort,
    );

    try {
      const result = (await this.plugin.apiClient.chat(
        canvasPrompt,
        { stream: false, maxTokens: 4096 },
      )) as string;

      const jsonMatch = result.match(
        /```canvasjson\n([\s\S]*?)\n```/,
      );
      if (jsonMatch) {
        const canvasData = JSON.parse(jsonMatch[1]);
        const canvasPath = `${sourceName}_graph.canvas`;
        await this.plugin.app.vault.create(
          canvasPath,
          JSON.stringify(canvasData, null, 2),
        );
        new Notice(`知识图谱已生成：${sourceName}_graph`);
      } else {
        new Notice("AI 未能生成有效的知识图谱结构");
      }
    } catch (err) {
      new Notice(
        "生成失败：" +
          (err instanceof Error ? err.message : "未知错误"),
      );
    }
  }

  private getEditorSelection(): {
    text: string;
    editor: { replaceSelection: (text: string) => void };
  } | null {
    const view =
      this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return null;
    const selection = view.editor.getSelection()?.trim();
    if (!selection) return null;
    return { text: selection, editor: view.editor };
  }
}

// ---- Canvas Prompt ----

function getCanvasPrompt(
  content: string,
  fileName: string,
): import("./types").ChatMessage[] {
  return [
    {
      role: "system",
      content: `You are a knowledge-graph builder. Output ONLY a \`\`\`canvasjson block with nodes and edges.

Node rules:
- Root (n1): Complete statement. Color "4" (blue).
- Level 1 concepts: Substantive labels. Color "2" (green). 2-4 bullet points.
- Insight nodes: Color "5" (yellow). Cross-ref nodes: Color "6" (purple).
- Each node max 400 chars. Scale: 6-16 nodes total. Max 3 levels deep.
- Do NOT include x, y, width, height — layout is automatic.

Edge rules:
- Every non-root node connects to one parent.
- Add 2-4 cross-edges with labels ("depends on", "contrasts with", "leads to").

Format:
\`\`\`canvasjson
{
  "nodes": [
    {"id":"n1","type":"text","text":"# Central Idea\\nOne-sentence essence","color":"4"},
    {"id":"n2","type":"text","text":"## Concept\\n- Point 1\\n- Point 2","color":"2"}
  ],
  "edges": [
    {"id":"e1","fromNode":"n1","toNode":"n2"},
    {"id":"e2","fromNode":"n2","toNode":"n3","label":"contrasts with"}
  ]
}
\`\`\``,
    },
    {
      role: "user",
      content: `为以下内容创建知识图谱：「${fileName}」\n\n${content.slice(0, 8000)}`,
    },
  ];
}
