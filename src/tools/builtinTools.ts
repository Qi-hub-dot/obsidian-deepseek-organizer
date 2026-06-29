// ============================================================
// Built-in tools — vault read/write, search, time, file tree
// ============================================================
import { ToolRegistry, getToolRegistry, type ToolDef } from "./ToolRegistry";
import type DeepSeekPlugin from "../../main";
import { TFile, Notice } from "obsidian";
import { getSearchIndex } from "../search/vaultSearch";

export function registerBuiltinTools(plugin: DeepSeekPlugin): void {
  const registry = getToolRegistry();

  // ---- readNote ----
  registry.register({
    name: "readNote",
    description: "Read the content of a note by its path or title",
    parameters: {
      path: { type: "string", description: "Vault-relative path to the note, e.g. 'MyFolder/MyNote.md'" },
    },
    execute: async (params) => {
      const path = params.path as string;
      const file = plugin.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) return `未找到笔记「${path}」。请用 searchVault 搜索，或直接基于已知内容回答。`;
      const content = await plugin.app.vault.read(file);
      return `# ${file.basename}\n\n${content.slice(0, 8000)}`;
    },
  });

  // ---- searchVault ----
  registry.register({
    name: "searchVault",
    description: "Search the vault for notes matching a query",
    parameters: {
      query: { type: "string", description: "Search query" },
      topK: { type: "number", description: "Number of results (default 5)" },
    },
    execute: async (params) => {
      const query = params.query as string;
      const topK = (params.topK as number) || 5;
      const index = getSearchIndex();
      const results = index.search(query, Math.min(topK, 10));
      if (results.length === 0) return "无匹配笔记（vault 中没有相关内容，可以直接新建）。";
      const high = results.filter(r => r.score >= 0.5);
      const low = results.filter(r => r.score < 0.5);
      let output = `找到 ${results.length} 条结果（${high.length} 条高相关，${low.length} 条低相关）：\n`;
      output += results.map((r) => {
        const tag = r.score >= 0.5 ? "🟢高相关" : "🟡低相关";
        return `- ${tag} [[${r.title}]] — ${r.snippet.slice(0, 150)}`;
      }).join("\n");
      if (high.length === 0) output += "\n⚠️ 没有高相关结果，建议直接创建新笔记。";
      return output;
    },
  });

  // ---- createNote ----
  registry.register({
    name: "createNote",
    description: "Create a new note in the vault",
    parameters: {
      path: { type: "string", description: "Vault-relative path, e.g. 'Folder/Note.md'" },
      content: { type: "string", description: "Markdown content for the note" },
    },
    execute: async (params) => {
      const path = params.path as string;
      const content = params.content as string;
      // Ensure parent folders exist
      const parts = path.split("/");
      if (parts.length > 1) {
        let current = "";
        for (let i = 0; i < parts.length - 1; i++) {
          current += (current ? "/" : "") + parts[i];
          if (!plugin.app.vault.getAbstractFileByPath(current)) {
            await plugin.app.vault.createFolder(current);
          }
        }
      }
      await plugin.app.vault.create(path, content);
      new Notice(`笔记已创建: ${path}`);
      return `Note created: ${path}`;
    },
  });

  // ---- appendNote ----
  registry.register({
    name: "appendNote",
    description: "Append content to an existing note",
    parameters: {
      path: { type: "string", description: "Vault-relative path" },
      content: { type: "string", description: "Content to append" },
    },
    execute: async (params) => {
      const path = params.path as string;
      const content = params.content as string;
      const file = plugin.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) return `Note not found: ${path}`;
      const existing = await plugin.app.vault.read(file);
      await plugin.app.vault.modify(file, existing + "\n\n" + content);
      return `Content appended to: ${path}`;
    },
  });

  // ---- getFileTree ----
  registry.register({
    name: "getFileTree",
    description: "List files and folders in the vault",
    parameters: {
      path: { type: "string", description: "Folder path (empty for root)" },
    },
    execute: async (params) => {
      const path = (params.path as string) || "";
      const folder = path
        ? plugin.app.vault.getAbstractFileByPath(path)
        : plugin.app.vault.getRoot();
      if (!folder) return `Folder not found: ${path}`;
      const children = (folder as any).children || [];
      if (!children || children.length === 0) return "Empty folder.";
      return children
        .slice(0, 50)
        .map((c: any) => {
          const isDir = !(c instanceof TFile);
          return `${isDir ? "📁" : "📄"} ${c.name}${isDir ? "/" : ""}`;
        })
        .join("\n");
    },
  });

  // ---- getTags ----
  registry.register({
    name: "getTags",
    description: "List all tags used in the vault",
    parameters: {},
    execute: async () => {
      const tags = (plugin.app.metadataCache as any).getTags?.() || {};
      const entries = Object.entries(tags) as Array<[string, number]>;
      if (entries.length === 0) return "No tags found.";
      return entries
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([tag, count]) => `#${tag} (${count})`)
        .join("\n");
    },
  });

  // ---- getCurrentTime ----
  registry.register({
    name: "getCurrentTime",
    description: "Get current date and time",
    parameters: {},
    execute: async () => {
      const now = new Date();
      return now.toISOString() + " (" + now.toLocaleString("zh-CN") + ")";
    },
  });
}
