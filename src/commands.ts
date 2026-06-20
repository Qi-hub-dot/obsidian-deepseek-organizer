// ============================================================
// 命令面板注册
// ============================================================
import type DeepSeekPlugin from "../main";

/**
 * 注册所有命令面板操作。
 * 调用时机：plugin.onload() 中。
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
        sidebar.showAssistantMessage("⚠️ 请先打开一篇笔记。");
        return;
      }

      sidebar.showUserMessage("请为当前笔记生成摘要");
      // 实际的摘要逻辑将在 pipeline.ts 中实现 (Phase 5)
      // 这里通过聊天管道自然触发
      sidebar.showAssistantMessage(
        "💡 请在聊天面板中告诉我你想要的摘要风格：" +
          "简洁 (concise)、详细 (detailed)、或大纲 (outline)。",
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
        sidebar.showAssistantMessage("⚠️ 请先打开一篇笔记。");
        return;
      }

      sidebar.showUserMessage("请为当前笔记推荐合适的标签");
      sidebar.showAssistantMessage(
        "🔖 标签建议功能将在 Phase 5 中实现为专用 UI。" +
          "目前可以通过聊天获得建议。",
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
        sidebar.showAssistantMessage("⚠️ 请先打开一篇笔记。");
        return;
      }

      sidebar.showUserMessage("请为当前笔记推荐相关笔记的双向链接");
      sidebar.showAssistantMessage(
        "🔗 双向链接建议功能将在 Phase 5 中实现为专用 UI。" +
          "目前可以通过聊天获得建议。",
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

      const view =
        plugin.app.workspace.getActiveViewOfType(
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          require("obsidian").MarkdownView,
        );
      const selection = (view as any)?.editor?.getSelection();
      if (!selection?.trim()) {
        sidebar.showAssistantMessage("⚠️ 请先选中一段文本。");
        return;
      }

      sidebar.showUserMessage(`请润色以下文本：\n\n${selection}`);
      sidebar.showAssistantMessage(
        "✍️ 润色功能将在 Phase 5 中实现为专用 diff 对比视图。",
      );
    },
  });

  // ---- 导入文件 ----
  plugin.addCommand({
    id: "deepseek-import-file",
    name: "DeepSeek: 导入文件并拆分",
    callback: async () => {
      await plugin.activateChatSidebar();
      const sidebar = plugin.getSidebarView();
      if (!sidebar) return;

      // 触发文件选择对话框
      triggerFileImport(plugin, sidebar);
    },
  });
}

// ---- 辅助函数 ----

function getCurrentNoteContent(plugin: DeepSeekPlugin): string | null {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const MarkdownView = require("obsidian").MarkdownView;
  const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
  if (!view) return null;
  const selection = (view as any).editor.getSelection();
  return selection?.trim() || (view as any).editor.getValue() || null;
}

function triggerFileImport(
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

    sidebar.showUserMessage(`正在导入文件：${file.name}`);
    sidebar.showAssistantMessage(
      "📥 文件导入与智能拆分功能将在 Phase 3-4 中实现。" +
        "支持 .md / .txt / .pdf / .docx 格式。",
    );
  });

  input.click();
}
