// ============================================================
// @mention provider — autocomplete notes, tags, folders
// ============================================================
import type { App } from "obsidian";

export interface MentionItem {
  type: "note" | "tag" | "folder";
  id: string;
  label: string;
  /** Short description */
  desc?: string;
}

/**
 * Get mention suggestions based on query text.
 */
export function getMentions(
  app: App,
  query: string,
  maxResults = 10,
): MentionItem[] {
  const results: MentionItem[] = [];
  const q = query.toLowerCase().trim();

  // Notes
  const files = app.vault.getMarkdownFiles();
  for (const file of files) {
    if (file.basename.toLowerCase().includes(q)) {
      results.push({
        type: "note",
        id: file.path,
        label: file.basename,
        desc: file.path,
      });
      if (results.length >= maxResults) return results.slice(0, maxResults);
    }
  }

  // Tags
  const tags = (app.metadataCache as any).getTags?.() || {};
  for (const [tag] of Object.entries(tags) as Array<[string, number]>) {
    if (tag.toLowerCase().includes(q) && !tag.startsWith("#")) {
      results.push({
        type: "tag",
        id: "#" + tag,
        label: "#" + tag,
      });
      if (results.length >= maxResults) return results.slice(0, maxResults);
    }
  }

  // Folders
  const folders = new Set<string>();
  for (const file of files) {
    const parts = file.path.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const folder = parts.slice(0, i).join("/");
      folders.add(folder);
    }
  }
  for (const folder of folders) {
    if (folder.toLowerCase().includes(q)) {
      results.push({
        type: "folder",
        id: folder,
        label: "📁 " + folder,
      });
      if (results.length >= maxResults) return results.slice(0, maxResults);
    }
  }

  return results;
}

/**
 * Parse @mentions from message text.
 * Returns the cleaned message and list of mentions.
 */
export function parseMentions(
  text: string,
): { cleanText: string; mentions: MentionItem[] } {
  const mentions: MentionItem[] = [];
  const mentionRegex = /@(\[\[)?([^\]]+?)(\]\])?(?=\s|$)/g;
  const cleanText = text.replace(
    mentionRegex,
    (match, _bracket1, inner, _bracket2) => {
      const isNote = inner.includes(".md") || !inner.includes("/") && !inner.startsWith("#");
      const isTag = inner.startsWith("#");
      const isFolder = !isNote && !isTag;

      if (isTag) {
        mentions.push({ type: "tag", id: inner, label: inner });
      } else if (isNote) {
        mentions.push({
          type: "note",
          id: inner,
          label: inner.replace(/\.md$/, ""),
        });
      } else {
        mentions.push({ type: "folder", id: inner, label: "📁 " + inner });
      }
      return "";
    },
  );

  return { cleanText: cleanText.trim(), mentions };
}
