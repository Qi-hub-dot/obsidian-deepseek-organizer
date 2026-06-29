// ============================================================
// ChatPersistenceManager — save/load conversations as Markdown
// ============================================================
import { type App, TFile, Notice } from "obsidian";
import type { ChatMessage } from "../types";

export class ChatPersistenceManager {
  private app: App;
  private folder: string;

  constructor(app: App, folder = "AI聊天记录") {
    this.app = app;
    this.folder = folder;
  }

  private async ensureFolder(): Promise<void> {
    if (!this.app.vault.getAbstractFileByPath(this.folder)) {
      await this.app.vault.createFolder(this.folder);
    }
  }

  /**
   * Save a conversation as a Markdown file.
   * Frontmatter: topic, date, model
   */
  async saveConversation(
    messages: ChatMessage[],
    topic?: string,
    model?: string,
  ): Promise<string> {
    await this.ensureFolder();

    const firstUserMsg =
      messages.find((m) => m.role === "user")?.content || "";
    const title =
      topic ||
      firstUserMsg.replace(/^#+\s*/, "").trim().slice(0, 50) ||
      "对话记录";

    const safeName = title
      .replace(/[\\/:*?"<>|#^\[\]]/g, "")
      .slice(0, 100);
    const date = new Date().toISOString();

    const frontmatter = [
      "---",
      `topic: ${title}`,
      `date: ${date}`,
      `model: ${model || "deepseek"}`,
      `type: ai-chat`,
      "---",
      "",
    ].join("\n");

    const body = messages
      .map((m) => {
        const roleLabel = m.role === "user" ? "🧑 **你**" : "🤖 **AI**";
        return `${roleLabel}\n\n${m.content}\n`;
      })
      .join("\n---\n\n");

    const filePath = `${this.folder}/${safeName}_${Date.now().toString(36)}.md`;

    // Handle conflict
    let finalPath = filePath;
    let counter = 1;
    while (this.app.vault.getAbstractFileByPath(finalPath)) {
      finalPath = `${this.folder}/${safeName}_${Date.now().toString(36)}_${counter}.md`;
      counter++;
    }

    await this.app.vault.create(finalPath, frontmatter + body);
    return finalPath;
  }

  /**
   * Load a conversation from a Markdown file.
   */
  async loadConversation(
    filePath: string,
  ): Promise<ChatMessage[]> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) return [];

    const raw = await this.app.vault.read(file);
    // Strip frontmatter
    const bodyMatch = raw.match(/^---\n[\s\S]*?\n---\n\n([\s\S]*)/);
    const body = bodyMatch ? bodyMatch[1] : raw;

    // Parse alternating user/AI messages
    const messages: ChatMessage[] = [];
    const parts = body.split(/\n---\n/);

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith("🧑 **你**")) {
        messages.push({
          role: "user",
          content: trimmed.replace(/^🧑 \*\*你\*\*\n+/, ""),
        });
      } else if (trimmed.startsWith("🤖 **AI**")) {
        messages.push({
          role: "assistant",
          content: trimmed.replace(/^🤖 \*\*AI\*\*\n+/, ""),
        });
      }
    }

    return messages;
  }

  /**
   * List all saved conversations.
   */
  getSavedConversations(): Array<{
    path: string;
    topic: string;
    date: string;
  }> {
    const file = this.app.vault.getAbstractFileByPath(this.folder);
    if (!file) return [];

    const children = (file as any).children || [];
    return children
      .filter((c: any) => c instanceof TFile && c.extension === "md")
      .map((f: TFile) => {
        const cache = this.app.metadataCache.getFileCache(f);
        const topic =
          (cache?.frontmatter as any)?.topic || f.basename;
        const date =
          (cache?.frontmatter as any)?.date || "";
        return { path: f.path, topic, date };
      })
      .sort(
        (a: any, b: any) =>
          new Date(b.date).getTime() - new Date(a.date).getTime(),
      )
      .slice(0, 20);
  }

  /**
   * Delete a saved conversation.
   */
  async deleteConversation(filePath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      await this.app.vault.delete(file);
      new Notice("已删除对话记录");
    }
  }
}
