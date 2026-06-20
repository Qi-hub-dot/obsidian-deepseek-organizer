// ============================================================
// 统一处理流水线
// ============================================================
import type { App, TFile } from "obsidian";
import { Notice } from "obsidian";
import type DeepSeekPlugin from "../main";
import {
  getParserForFile,
  isSupportedFile,
} from "./parsers/index";
import { Sanitizer } from "./sanitizer";
import * as prompts from "./prompts";
import {
  parseSplitResult,
  parseTagSuggestions,
  parseLinkSuggestions,
} from "./response-parser";
import { SplitPreviewModal } from "./ui/preview-modal";
import type {
  SplitNote,
  TagSuggestion,
  LinkSuggestion,
  SummaryStyle,
  PolishMode,
} from "./types";
import { DeepSeekError } from "./types";

// ============================================================
// 笔记写入工具 (Step 4.4)
// ============================================================

/** 生成安全文件名（移除非法字符） */
function safeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|#^\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** 生成 frontmatter */
function buildFrontmatter(
  title: string,
  sourceFile: string,
  tags: string[],
): string {
  const tagList = tags.length > 0 ? `\ntags: [${tags.join(", ")}]` : "";
  return [
    "---",
    `title: ${title}`,
    `source: ${sourceFile}`,
    `created: ${new Date().toISOString()}`,
    tags.length > 0 ? `tags: [${tags.join(", ")}]` : "",
    "---",
    "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/** 处理文件名冲突：自动追加序号 */
async function resolveConflict(
  app: App,
  folderPath: string,
  baseName: string,
): Promise<string> {
  let fileName = `${baseName}.md`;
  let counter = 1;
  while (app.vault.getAbstractFileByPath(`${folderPath}/${fileName}`)) {
    fileName = `${baseName} (${counter}).md`;
    counter++;
  }
  return fileName;
}

/** 写入单条拆分笔记 */
async function writeNote(
  app: App,
  folderPath: string,
  note: SplitNote,
  sourceFileName: string,
): Promise<TFile> {
  // 确保目录存在
  const parts = folderPath.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current += part + "/";
    const folder = app.vault.getAbstractFileByPath(
      current.slice(0, -1),
    );
    if (!folder) {
      await app.vault.createFolder(current.slice(0, -1));
    }
  }

  const safeTitle = safeFileName(note.title);
  const fileName = await resolveConflict(app, folderPath, safeTitle);
  const filePath = `${folderPath}/${fileName}`;

  const frontmatter = buildFrontmatter(
    note.title,
    sourceFileName,
    note.tags,
  );
  const fullContent = frontmatter + "\n" + note.content;

  return app.vault.create(filePath, fullContent);
}

// ============================================================
// 流水线主类
// ============================================================

export class Pipeline {
  private plugin: DeepSeekPlugin;

  constructor(plugin: DeepSeekPlugin) {
    this.plugin = plugin;
  }

  // ---- 文件导入与拆分 (Phase 4) ----

  /** 导入文件并 AI 拆分 */
  async importAndSplit(
    file: File,
    onStatus: (msg: string) => void,
  ): Promise<void> {
    const app = this.plugin.app;

    // 1. 前置检查
    if (!isSupportedFile(file.name)) {
      throw new DeepSeekError(
        0,
        `不支持的文件格式：${file.name.split(".").pop()}。支持：.md, .txt, .pdf, .docx`,
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new DeepSeekError(0, "文件超过 5MB 限制，请压缩或拆分后再导入。");
    }

    onStatus(`正在解析 ${file.name}…`);

    // 2. 解析文件
    const parser = await getParserForFile(file.name);
    if (!parser) {
      throw new DeepSeekError(0, "无法识别文件格式。");
    }

    const arrayBuffer = await file.arrayBuffer();
    let text = await parser.parse(arrayBuffer);

    // 3. Token 软限制（约 50k token，中文约 100k 字符）
    const MAX_CHARS = 100000;
    if (text.length > MAX_CHARS) {
      new Notice(
        `文件内容超过 ${Math.round(MAX_CHARS / 1000)}k 字符限制，已截断前 ${Math.round(MAX_CHARS / 1000)}k 字符。`,
        6000,
      );
      text = text.slice(0, MAX_CHARS);
    }

    onStatus(`正在脱敏处理…`);

    // 4. 脱敏（若启用）
    const settings = this.plugin.settings;
    if (settings.sanitizerEnabled) {
      const result = Sanitizer.sanitizeWithRules(text, settings.sanitizerRules);
      text = result.sanitized;
      if (result.count > 0) {
        onStatus(`已过滤 ${result.count} 处敏感信息`);
      }
    }

    onStatus(`正在 AI 语义拆分…`);

    // 5. 调用 API 拆分
    const messages = prompts.buildSplitPrompt(file.name, text);
    const response = (await this.plugin.apiClient.chat(messages, {
      stream: false,
    })) as string;

    if (!response) {
      throw new DeepSeekError(0, "AI 未返回拆分结果，请重试。");
    }

    // 6. 解析结果
    const notes = parseSplitResult(response);
    if (notes.length === 0) {
      throw new DeepSeekError(0, "未能从文件中提取可拆分的笔记。");
    }

    onStatus(`已识别 ${notes.length} 个主题，等待确认…`);

    // 7. 预览 + 确认
    const targetFolder =
      `${settings.defaultTargetFolder}/${file.name.replace(/\.[^.]+$/, "")}`;
    const modal = new SplitPreviewModal(
      app,
      notes,
      file.name,
      targetFolder,
    );
    const result = await modal.openAndWait();

    if (!result.confirmed) {
      onStatus("已取消导入。");
      return;
    }

    // 8. 写入笔记
    let written = 0;
    for (const note of result.notes) {
      try {
        await writeNote(app, result.targetFolder, note, file.name);
        written++;
      } catch (err) {
        console.error(`写入笔记 "${note.title}" 失败：`, err);
      }
    }

    new Notice(
      `✅ 已成功导入 ${written}/${result.notes.length} 篇笔记到「${result.targetFolder}」`,
      5000,
    );
  }

  // ---- 摘要生成 (Step 5.1) ----

  async summarize(
    content: string,
    style: SummaryStyle = "concise",
  ): Promise<string> {
    let text = content;
    const settings = this.plugin.settings;
    if (settings.sanitizerEnabled) {
      text = Sanitizer.sanitizeWithRules(text, settings.sanitizerRules).sanitized;
    }
    const messages = prompts.buildSummarizePrompt(text, style);
    return (await this.plugin.apiClient.chat(messages, {
      stream: false,
    })) as string;
  }

  // ---- 标签建议 (Step 5.2) ----

  async suggestTags(
    content: string,
    existingTags: string[] = [],
  ): Promise<TagSuggestion[]> {
    let text = content;
    const settings = this.plugin.settings;
    if (settings.sanitizerEnabled) {
      text = Sanitizer.sanitizeWithRules(text, settings.sanitizerRules).sanitized;
    }
    const messages = prompts.buildTagSuggestionPrompt(text, existingTags);
    const response = (await this.plugin.apiClient.chat(messages, {
      stream: false,
    })) as string;
    return parseTagSuggestions(response);
  }

  // ---- 双向链接建议 (Step 5.3) ----

  async suggestLinks(
    content: string,
    vaultNoteTitles: string[],
  ): Promise<LinkSuggestion[]> {
    let text = content;
    const settings = this.plugin.settings;
    if (settings.sanitizerEnabled) {
      text = Sanitizer.sanitizeWithRules(text, settings.sanitizerRules).sanitized;
    }
    const messages = prompts.buildLinkSuggestionPrompt(
      text,
      vaultNoteTitles,
    );
    const response = (await this.plugin.apiClient.chat(messages, {
      stream: false,
    })) as string;
    return parseLinkSuggestions(response);
  }

  // ---- 内容润色 (Step 5.4) ----

  async polish(
    content: string,
    mode: PolishMode = "improve",
  ): Promise<string> {
    let text = content;
    const settings = this.plugin.settings;
    if (settings.sanitizerEnabled) {
      text = Sanitizer.sanitizeWithRules(text, settings.sanitizerRules).sanitized;
    }
    const messages = prompts.buildPolishPrompt(text, mode);
    return (await this.plugin.apiClient.chat(messages, {
      stream: false,
    })) as string;
  }

  // ---- 去重判断 (Step 5.4) ----

  async checkDedup(
    noteA: string,
    noteB: string,
  ): Promise<{ similarity: number; recommendation: string }> {
    let textA = noteA;
    let textB = noteB;
    const settings = this.plugin.settings;
    if (settings.sanitizerEnabled) {
      textA = Sanitizer.sanitizeWithRules(textA, settings.sanitizerRules).sanitized;
      textB = Sanitizer.sanitizeWithRules(textB, settings.sanitizerRules).sanitized;
    }
    const messages = prompts.buildDedupPrompt(textA, textB);
    const response = (await this.plugin.apiClient.chat(messages, {
      stream: false,
    })) as string;

    try {
      const json = JSON.parse(response);
      return {
        similarity: Math.min(1, Math.max(0, json.similarity || 0)),
        recommendation: json.recommendation || "",
      };
    } catch {
      return { similarity: 0, recommendation: response };
    }
  }
}
