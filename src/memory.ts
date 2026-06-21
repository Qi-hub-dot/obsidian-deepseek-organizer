// ============================================================
// 记忆管理器 —— 持久化上下文缓存 + 语义记忆
// ============================================================
import { TFile, type App } from "obsidian";
import { Notice } from "obsidian";

export interface MemoryEntry {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: number;
  lastAccessed: number;
  source: string; // 来源对话标识
}

const MEMORY_FRONTMATTER = "---\ntitle: $TITLE\ndate: $DATE\ntags: [$TAGS]\nsource: $SOURCE\n---\n\n";

/** 简单中文分词：按常见分隔符切词，取 2-4 字片段做索引 */
function tokenize(text: string): string[] {
  const cleaned = text.replace(/[，。！？、；：""''（）\[\]【】《》\s\n]+/g, " ").trim();
  const words = cleaned.split(/[\s]+/).filter(w => w.length >= 2);
  const tokens: string[] = [];
  for (const w of words) {
    if (w.length <= 4) { tokens.push(w); continue; }
    // 长词切为 2-3 字片段
    for (let i = 0; i < w.length - 1; i += 2) {
      tokens.push(w.slice(i, Math.min(i + 3, w.length)));
    }
  }
  return [...new Set(tokens)];
}

export class MemoryStore {
  private app: App;
  private folder: string;
  private maxSizeMB: number;
  private index: Map<string, MemoryEntry> = new Map();
  private initialized = false;

  constructor(app: App, folder: string, maxSizeMB = 100) {
    this.app = app;
    this.folder = folder;
    this.maxSizeMB = maxSizeMB;
  }

  /** 启动时扫描记忆文件夹，构建内存索引 */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this._ensureFolder();
    const files = this.app.vault.getMarkdownFiles()
      .filter(f => f.path.startsWith(this.folder + "/"));
    
    for (const file of files) {
      const entry = await this._fileToEntry(file);
      if (entry) this.index.set(entry.id, entry);
    }
    this.initialized = true;
    console.log(`[Memory] 已加载 ${this.index.size} 条记忆`);
  }

  /** 检索与查询最相关的记忆（关键词重叠评分） */
  retrieve(query: string, topK = 5): MemoryEntry[] {
    const qTokens = new Set(tokenize(query));
    if (qTokens.size === 0) return [];
    
    const scored: Array<{ entry: MemoryEntry; score: number }> = [];
    for (const entry of this.index.values()) {
      const eTokens = tokenize(entry.title + " " + entry.content.slice(0, 500));
      let overlap = 0;
      for (const t of eTokens) { if (qTokens.has(t)) overlap++; }
      if (overlap > 0) {
        // 分数 = 重叠词数 / 查询词数，加时间衰减
        const recency = Math.min(1, (Date.now() - entry.lastAccessed) / (7 * 86400_000));
        scored.push({ entry, score: (overlap / qTokens.size) * (1 - recency * 0.3) });
      }
    }
    
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map(s => {
      s.entry.lastAccessed = Date.now();
      return s.entry;
    });
  }

  /** 存入一条记忆（自动去重：同标题覆盖） */
  async store(entry: Omit<MemoryEntry, "id" | "createdAt" | "lastAccessed">): Promise<void> {
    await this._ensureFolder();
    // 去重检查
    for (const existing of this.index.values()) {
      if (existing.title === entry.title) {
        existing.content = entry.content;
        existing.tags = entry.tags;
        existing.lastAccessed = Date.now();
        await this._writeEntry(existing);
        return;
      }
    }
    
    const id = "mem_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
    const full: MemoryEntry = {
      ...entry,
      id,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
    };
    this.index.set(id, full);
    await this._writeEntry(full);
    await this._enforceSizeLimit();
  }

  /** 从对话内容中自动提取摘要记忆 */
  async extractFromConversation(
    source: string,
    userMessages: string[],
    assistantMessages: string[],
  ): Promise<void> {
    // 简单启发式：取第一个用户消息的前 60 字符作标题
    const firstUser = userMessages[0] || assistantMessages[0] || "";
    const title = firstUser.replace(/^#+\s*/, "").trim().slice(0, 60) || "对话记忆";
    
    // 合并最近几条交换为内容摘要
    const combined = userMessages.slice(-3).map((m, i) => {
      const reply = assistantMessages[i] || "";
      return `Q: ${m.slice(0, 200)}\nA: ${reply.slice(0, 300)}`;
    }).join("\n\n");
    
    // 提取标签
    const tagSet = new Set<string>();
    const tagMatch = combined.match(/#[\w\u4e00-\u9fa5-]+/g);
    if (tagMatch) for (const t of tagMatch.slice(0, 5)) tagSet.add(t.replace(/^#/, ""));
    
    await this.store({
      title,
      content: combined.slice(0, 2000),
      tags: [...tagSet],
      source,
    });
  }

  /** 删除指定记忆 */
  async remove(id: string): Promise<void> {
    const entry = this.index.get(id);
    if (!entry) return;
    const path = this._entryPath(entry);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file) await this.app.vault.delete(file);
    this.index.delete(id);
  }

  /** 清空全部记忆 */
  async clear(): Promise<void> {
    const files = this.app.vault.getMarkdownFiles()
      .filter(f => f.path.startsWith(this.folder + "/"));
    for (const f of files) {
      await this.app.vault.delete(f);
    }
    this.index.clear();
    new Notice("已清空全部记忆");
  }

  /** 导出记忆为单文件 */
  async exportAll(): Promise<void> {
    const lines: string[] = ["# 记忆导出\n"];
    for (const entry of this.index.values()) {
      lines.push(`## ${entry.title}`);
      lines.push(`- 标签: ${entry.tags.join(", ") || "无"}`);
      lines.push(`- 来源: ${entry.source}`);
      lines.push(`- 时间: ${new Date(entry.createdAt).toISOString()}`);
      lines.push("");
      lines.push(entry.content);
      lines.push("\n---\n");
    }
    const path = this.folder + "/记忆导出_" + new Date().toISOString().slice(0, 10) + ".md";
    await this.app.vault.create(path, lines.join("\n"));
    new Notice("已导出记忆: " + path);
  }

  get count(): number { return this.index.size; }
  private _encoder = new TextEncoder();

  get totalSizeBytes(): number {
    let total = 0;
    for (const entry of this.index.values()) {
      total += this._encoder.encode(entry.title + entry.content).length;
    }
    return total;
  }

  // ---- 内部 ----

  private async _ensureFolder(): Promise<void> {
    if (!this.app.vault.getAbstractFileByPath(this.folder)) {
      await this.app.vault.createFolder(this.folder);
    }
  }

  private _entryPath(entry: MemoryEntry): string {
    const safe = entry.title.replace(/[\\/:*?"<>|#^\[\]]/g, "").slice(0, 50);
    return `${this.folder}/${safe}_${entry.id}.md`;
  }

  private async _fileToEntry(file: TFile): Promise<MemoryEntry | null> {
    try {
      const raw = await this.app.vault.read(file);
      const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?/);
      if (!fmMatch) return null;
      
      const fm = fmMatch[1];
      const body = raw.slice(fmMatch[0].length).trim();
      const title = (fm.match(/^title:\s*(.+)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, "") || file.basename;
      const dateStr = (fm.match(/^date:\s*(.+)$/m) || [])[1]?.trim() || "";
      const tagsStr = (fm.match(/^tags:\s*\[(.+)\]$/m) || [])[1] || "";
      const source = (fm.match(/^source:\s*(.+)$/m) || [])[1]?.trim() || "";
      const tags = tagsStr.split(",").map(t => t.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
      
      return {
        id: file.basename.split("_").pop() || file.basename,
        title,
        content: body,
        tags,
        createdAt: dateStr ? new Date(dateStr).getTime() : file.stat.mtime,
        lastAccessed: file.stat.mtime,
        source,
      };
    } catch {
      return null;
    }
  }

  private async _writeEntry(entry: MemoryEntry): Promise<void> {
    const path = this._entryPath(entry);
    const date = new Date(entry.createdAt).toISOString();
    const tags = entry.tags.join(", ");
    const fm = MEMORY_FRONTMATTER
      .replace("$TITLE", entry.title)
      .replace("$DATE", date)
      .replace("$TAGS", tags)
      .replace("$SOURCE", entry.source);
    const content = fm + entry.content;
    
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(path, content);
    }
  }

  /** LRU 容量控制：总大小超过限制时删除最旧记忆 */
  private async _enforceSizeLimit(): Promise<void> {
    const maxBytes = this.maxSizeMB * 1024 * 1024;
    let total = this.totalSizeBytes;
    
    if (total <= maxBytes) return;
    
    // 按 lastAccessed 升序（最旧的在前）
    const sorted = [...this.index.values()].sort((a, b) => a.lastAccessed - b.lastAccessed);
    
    for (const entry of sorted) {
      if (total <= maxBytes * 0.8) break; // 降到 80% 时停止
      const size = this._encoder.encode(entry.title + entry.content).length;
      await this.remove(entry.id);
      total -= size;
    }
    
    if (sorted.length > 0 && total > maxBytes) {
      console.log(`[Memory] LRU 清理完成，当前: ${(total / 1024 / 1024).toFixed(1)}MB`);
    }
  }
}
