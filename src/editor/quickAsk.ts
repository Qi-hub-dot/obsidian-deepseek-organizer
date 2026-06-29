// ============================================================
// QuickAsk — CM6 editor extension for inline AI assistance
// ============================================================
import { EditorView } from "@codemirror/view";
import type DeepSeekPlugin from "../../main";

/**
 * Register the Quick Ask command that takes selected text
 * and sends it to the sidebar for AI processing.
 */
export function registerQuickAsk(plugin: DeepSeekPlugin): void {
  plugin.addCommand({
    id: "deepseek-quick-ask",
    name: "DeepSeek: 快速提问 (选中文本)",
    editorCallback: async (editor) => {
      const selection = editor.getSelection();
      if (!selection?.trim()) {
        // If no selection, use whole document
        const content = editor.getValue();
        const sidebar = plugin.getSidebarView();
        if (!sidebar) {
          await plugin.activateChatSidebar();
        }
        const sv = plugin.getSidebarView();
        if (!sv) return;

        sv.showUserMessage(
          "请帮我分析这篇笔记：\n\n" + content.slice(0, 5000),
        );
        return;
      }

      const sidebar = plugin.getSidebarView();
      if (!sidebar) {
        await plugin.activateChatSidebar();
      }
      const sv = plugin.getSidebarView();
      if (!sv) return;

      sv.showUserMessage(
        "关于以下选中的文本：\n\n" +
          selection.slice(0, 5000) +
          "\n\n请帮我分析/解释/处理。",
      );
    },
  });

  // Also add commands for common Quick Ask actions
  plugin.addCommand({
    id: "deepseek-explain-selection",
    name: "DeepSeek: 解释选中文本",
    editorCallback: async (editor) => {
      const selection = editor.getSelection();
      if (!selection?.trim()) return;

      const sidebar = plugin.getSidebarView();
      if (!sidebar) await plugin.activateChatSidebar();
      const sv = plugin.getSidebarView();
      if (!sv) return;

      sv.showUserMessage(
        "请解释以下文本：\n\n" + selection.slice(0, 4000),
      );
    },
  });

  plugin.addCommand({
    id: "deepseek-translate-selection",
    name: "DeepSeek: 翻译选中文本 (中→英)",
    editorCallback: async (editor) => {
      const selection = editor.getSelection();
      if (!selection?.trim()) return;

      const sidebar = plugin.getSidebarView();
      if (!sidebar) await plugin.activateChatSidebar();
      const sv = plugin.getSidebarView();
      if (!sv) return;

      sv.showUserMessage(
        "请将以下中文翻译为英文：\n\n" +
          selection.slice(0, 4000),
      );
    },
  });
}
