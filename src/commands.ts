// ============================================================
// 命令面板注册 (updated for React sidebar)
// ============================================================
import type DeepSeekPlugin from "../main";
import { Notice, MarkdownView } from "obsidian";
import { getParserForFile } from "./parsers/index";
import { DeepSeekError } from "./types";

/**
 * 注册所有命令面板操作。
 */
export function registerCommands(plugin: DeepSeekPlugin): void {
  // ---- 摘要 ----
  plugin.addCommand({
    id: "deepseek-summarize",
    name: "DeepSeek: 生成摘要",
    callback: async () => {
      await plugin.activateChatSidebar();
      const sidebar = plugin.getSidebarView();
      if (!sidebar) return;
      const noteContent = getCurrentNoteContent(plugin);
      if (!noteContent) {
        sidebar.showAssistantMessage("请先打开一篇笔记。");
        return;
      }
      sidebar.showUserMessage("请为当前笔记生成摘要");
      sidebar.showAssistantMessage(
        "请告诉我你想要的摘要风格：简洁 (concise)、详细 (detailed)、或大纲 (outline)。",
      );
    },
  });

  // ---- 标签 ----
  plugin.addCommand({
    id: "deepseek-suggest-tags",
    name: "DeepSeek: 推荐标签",
    callback: async () => {
      await plugin.activateChatSidebar();
      const sidebar = plugin.getSidebarView();
      if (!sidebar) return;
      const noteContent = getCurrentNoteContent(plugin);
      if (!noteContent) {
        sidebar.showAssistantMessage("请先打开一篇笔记。");
        return;
      }
      sidebar.showUserMessage("请为当前笔记推荐合适的标签");
      sidebar.showAssistantMessage(
        "请在聊天面板中告诉我你的标签偏好。",
      );
    },
  });

  // ---- 链接 ----
  plugin.addCommand({
    id: "deepseek-suggest-links",
    name: "DeepSeek: 推荐双向链接",
    callback: async () => {
      await plugin.activateChatSidebar();
      const sidebar = plugin.getSidebarView();
      if (!sidebar) return;
      const noteContent = getCurrentNoteContent(plugin);
      if (!noteContent) {
        sidebar.showAssistantMessage("请先打开一篇笔记。");
        return;
      }
      sidebar.showUserMessage("请为当前笔记推荐相关笔记的双向链接");
      sidebar.showAssistantMessage(
        "请告诉我你的链接偏好，我会分析并推荐。",
      );
    },
  });

  // ---- 润色 ----
  plugin.addCommand({
    id: "deepseek-polish",
    name: "DeepSeek: 润色选中文本",
    callback: async () => {
      await plugin.activateChatSidebar();
      const sidebar = plugin.getSidebarView();
      if (!sidebar) return;
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
      const selection = (view as any)?.editor?.getSelection();
      if (!selection?.trim()) {
        sidebar.showAssistantMessage("请先选中一段文本再执行润色。");
        return;
      }
      sidebar.showUserMessage(
        "请润色以下文本（保持原意，使表达更流畅专业）：\n\n" +
          selection,
      );
    },
  });

  // ---- 修改当前笔记 ----
  plugin.addCommand({
    id: "deepseek-modify-note",
    name: "DeepSeek: 修改当前笔记",
    callback: async () => {
      await plugin.activateChatSidebar();
      const sidebar = plugin.getSidebarView();
      if (!sidebar) return;
      const noteContent = getCurrentNoteContent(plugin);
      if (!noteContent) {
        sidebar.showAssistantMessage("请先打开一篇笔记。");
        return;
      }
      sidebar.showUserMessage(
        "请帮我修改当前笔记。以下是当前内容：\n\n" +
          noteContent.slice(0, 5000),
      );
      sidebar.showAssistantMessage(
        "请告诉我你想怎么修改？如：重写某段、补充内容、调整结构。",
      );
    },
  });

  // ---- 导入文件并分析（Pipeline 结构化导入）----
  plugin.addCommand({
    id: "deepseek-import-file",
    name: "DeepSeek: 导入文件并拆分",
    callback: async () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".md,.txt,.pdf,.docx";
      input.multiple = false;
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          await plugin.pipeline.importAndSplit(
            file,
            (msg) => new Notice(msg),
          );
        } catch (e) {
          const em =
            e instanceof DeepSeekError
              ? e.toUserMessage()
              : e instanceof Error
                ? e.message
                : "导入失败";
          new Notice(em);
        }
      });
      input.click();
    },
  });

  // ---- 分析附件写笔记 ----
  plugin.addCommand({
    id: "deepseek-analyze-file",
    name: "DeepSeek: 分析文件并写笔记",
    callback: async () => {
      await plugin.activateChatSidebar();
      const sidebar = plugin.getSidebarView();
      if (!sidebar) return;
      triggerFileAnalysis(plugin, sidebar);
    },
  });

  // ---- Canvas 知识网络命令 ----
  plugin.addCommand({
    id: "deepseek-canvas",
    name: "DeepSeek: 生成知识网络 (Canvas)",
    callback: async () => {
      await plugin.activateChatSidebar();
      const sidebar = plugin.getSidebarView();
      if (!sidebar) return;
      const noteContent = getCurrentNoteContent(plugin);
      if (!noteContent) {
        sidebar.showAssistantMessage(
          "请先打开一篇笔记或文件。",
        );
        return;
      }
      await sidebar.createCanvasFromContent(noteContent);
    },
  });

  // ---- 记忆管理命令 ----
  plugin.addCommand({
    id: "deepseek-memory-stats",
    name: "DeepSeek: 查看记忆统计",
    callback: async () => {
      const { memory } = plugin;
      if (!memory) return;
      const mb = (memory.totalSizeBytes / 1024 / 1024).toFixed(1);
      new Notice(`记忆: ${memory.count} 条, 总计 ${mb} MB`);
    },
  });

  plugin.addCommand({
    id: "deepseek-memory-clear",
    name: "DeepSeek: 清除全部记忆",
    callback: async () => {
      const { memory } = plugin;
      if (!memory) return;
      await memory.clear();
    },
  });

  plugin.addCommand({
    id: "deepseek-memory-export",
    name: "DeepSeek: 导出全部记忆",
    callback: async () => {
      const { memory } = plugin;
      if (!memory) return;
      await memory.exportAll();
    },
  });

  // ---- Copilot 内联增强 ----
  plugin.addCommand({
    id: "deepseek-inline-polish",
    name: "DeepSeek: 内联润色选中文本 (Copilot)",
    callback: async () => {
      const sidebar = plugin.getSidebarView();
      if (!sidebar) {
        await plugin.activateChatSidebar();
      }
      const sv = plugin.getSidebarView();
      if (!sv) return;
      await sv.inlinePolish();
    },
  });

  plugin.addCommand({
    id: "deepseek-inline-explain",
    name: "DeepSeek: 内联讲解选中文本 (Copilot)",
    callback: async () => {
      const sidebar = plugin.getSidebarView();
      if (!sidebar) {
        await plugin.activateChatSidebar();
      }
      const sv = plugin.getSidebarView();
      if (!sv) return;
      await sv.inlineExplain();
    },
  });

  // ---- 文档整理命令 ----
  plugin.addCommand({
    id: "deepseek-organize-note",
    name: "DeepSeek: 整理当前笔记",
    callback: async () => {
      await plugin.activateChatSidebar();
      const sidebar = plugin.getSidebarView();
      if (!sidebar) return;
      const noteContent = getCurrentNoteContent(plugin);
      if (!noteContent) {
        sidebar.showAssistantMessage("请先打开一篇笔记。");
        return;
      }
      sidebar.showUserMessage(
        "请整理以下笔记：提炼核心观点、关键事实、概念关联，重写为结构化笔记。\n\n" +
          noteContent.slice(0, 5000),
      );
    },
  });

  plugin.addCommand({
    id: "deepseek-atomic-notes",
    name: "DeepSeek: 拆分为原子笔记 (Zettelkasten)",
    callback: async () => {
      await plugin.activateChatSidebar();
      const sidebar = plugin.getSidebarView();
      if (!sidebar) return;
      const noteContent = getCurrentNoteContent(plugin);
      if (!noteContent) {
        sidebar.showAssistantMessage("请先打开一篇笔记。");
        return;
      }
      sidebar.showUserMessage(
        "请将以下笔记按 Zettelkasten 方法拆分为多篇原子笔记。每篇一个概念，用 [[wikilinks]] 连接。\n\n" +
          noteContent.slice(0, 5000),
      );
    },
  });
}

// ---- 辅助函数 ----

function getCurrentNoteContent(
  plugin: DeepSeekPlugin,
): string | null {
  const view =
    plugin.app.workspace.getActiveViewOfType(MarkdownView);
  if (!view) return null;
  const selection = (view as any).editor.getSelection();
  return selection?.trim() || (view as any).editor.getValue() || null;
}

/** 分析文件并生成笔记 */
function triggerFileAnalysis(
  plugin: DeepSeekPlugin,
  sidebar: any,
): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".md,.txt,.pdf,.docx";
  input.multiple = false;

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;

    sidebar.showUserMessage(
      "请分析文件「" + file.name + "」并帮我写一份笔记",
    );

    try {
      const arrayBuffer = await file.arrayBuffer();
      const parser = await getParserForFile(file.name);
      if (!parser) {
        sidebar.showAssistantMessage(
          "不支持的文件格式。支持：.md / .txt / .pdf / .docx",
        );
        return;
      }

      const content = await parser.parse(arrayBuffer);
      const truncated = content.slice(0, 30000);

      const effectiveKey = plugin.getEffectiveApiKey();
      if (!effectiveKey) {
        sidebar.showAssistantMessage(
          "API Key 未配置，请先在设置中填写 DeepSeek API Key。",
        );
        return;
      }

      plugin.apiClient.updateConfig(
        plugin.settings.baseUrl,
        effectiveKey,
        plugin.settings.model,
        plugin.settings.reasoningEffort,
      );

      const messages = [
        {
          role: "system" as const,
          content:
            "你是一个知识管理专家。分析文件内容并撰写一份结构清晰的笔记。\n\n要求：\n- 使用 Markdown 格式\n- 包含标题、核心要点、分析、总结\n- 条理清晰，适合存入 Obsidian 知识库\n- 用中文输出",
        },
        {
          role: "user" as const,
          content:
            "请分析文件「" +
            file.name +
            "」并写一份笔记：\n\n" +
            truncated,
        },
      ];

      const result = (await plugin.apiClient.chat(messages, {
        stream: true,
      })) as AsyncGenerator<string, void, undefined>;

      for await (const delta of result) {
        // The Chat component handles streaming via the send mechanism
        // For direct API calls from commands, add as assistant message
      }

      const fullResult = await plugin.apiClient.chat(messages, {
        stream: false,
      });
      sidebar.showAssistantMessage(fullResult as string);
    } catch (err) {
      sidebar.showAssistantMessage(
        "分析失败：" +
          (err instanceof Error ? err.message : "未知错误"),
      );
    }
  });

  input.click();
}
