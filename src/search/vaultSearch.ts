// ============================================================
// VaultSearchIndex — lightweight full-text search (TF-IDF)
// No external dependencies. Indexes vault on startup.
// ============================================================
import { TFile, type Vault } from "obsidian";

interface IndexedNote {
  path: string;
  title: string;
  content: string;
  tokens: Map<string, number>; // token → frequency in this doc
}

interface SearchResult {
  path: string;
  title: string;
  snippet: string;
  score: number;
}

/**
 * Simple Chinese + English tokenizer.
 * Splits on whitespace and extracts 2-4 char n-grams for CJK.
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];

  // Split into segments: CJK runs vs non-CJK
  const segments = text.split(/([\u4e00-\u9fff\u3400-\u4dbf]+)/);

  for (const seg of segments) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(seg)) {
      // CJK: bigrams + trigrams
      for (let i = 0; i < seg.length - 1; i++) {
        tokens.push(seg.slice(i, i + 2));
      }
      for (let i = 0; i < seg.length - 2; i++) {
        tokens.push(seg.slice(i, i + 3));
      }
    } else {
      // Non-CJK: split by word boundaries, lowercase, filter short
      const words = seg
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 2);
      tokens.push(...words);
    }
  }

  return tokens;
}

export class VaultSearchIndex {
  private vault: Vault;
  private notes: IndexedNote[] = [];
  private df = new Map<string, number>(); // document frequency
  private totalDocs = 0;
  private initialized = false;

  constructor(vault: Vault) {
    this.vault = vault;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const files = this.vault.getMarkdownFiles();
    this.totalDocs = files.length;

    // Reset
    this.notes = [];
    this.df.clear();

    for (const file of files) {
      try {
        const content = await this.vault.read(file);
        const idx: IndexedNote = {
          path: file.path,
          title: file.basename,
          content,
          tokens: new Map(),
        };

        const titleTokens = tokenize(file.basename);
        const bodyTokens = tokenize(
          content.slice(0, 5000), // Index first 5K chars
        );

        // Title tokens weighted 3x
        for (const t of titleTokens) {
          idx.tokens.set(t, (idx.tokens.get(t) || 0) + 3);
        }
        for (const t of bodyTokens) {
          idx.tokens.set(t, (idx.tokens.get(t) || 0) + 1);
        }

        // Update document frequency
        for (const t of idx.tokens.keys()) {
          this.df.set(t, (this.df.get(t) || 0) + 1);
        }

        this.notes.push(idx);
      } catch {
        // skip unreadable files
      }
    }

    this.initialized = true;
    console.log(
      `[Search] Indexed ${this.notes.length} notes, ${this.df.size} unique tokens`,
    );
  }

  /**
   * Search for relevant notes. Returns topK results with snippets.
   */
  search(query: string, topK = 5): SearchResult[] {
    if (!this.initialized || this.notes.length === 0) return [];

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const scored: Array<{ note: IndexedNote; score: number }> = [];

    for (const note of this.notes) {
      let score = 0;

      for (const qt of queryTokens) {
        const tf = note.tokens.get(qt) || 0;
        if (tf === 0) continue;
        const df = this.df.get(qt) || 1;
        // Simple TF-IDF: tf * log(N/df)
        score +=
          (1 + Math.log(tf)) * Math.log(this.totalDocs / df);
      }

      // Title match bonus
      const titleLower = note.title.toLowerCase();
      const queryLower = query.toLowerCase();
      if (titleLower.includes(queryLower)) {
        score *= 1.5;
      }

      if (score > 0) {
        scored.push({ note, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK).map(({ note, score }) => ({
      path: note.path,
      title: note.title,
      snippet: extractSnippet(note.content, queryTokens, 300),
      score: Math.round(score * 100) / 100,
    }));
  }

  /** Number of indexed notes */
  get count(): number {
    return this.notes.length;
  }
}

/**
 * Extract a relevant snippet around matching tokens.
 */
function extractSnippet(
  content: string,
  queryTokens: string[],
  maxLen: number,
): string {
  const lower = content.toLowerCase();
  let bestStart = 0;
  let bestScore = 0;

  // Find the window with the most query token matches
  const step = Math.floor(maxLen / 2);
  for (let i = 0; i < content.length - maxLen; i += step) {
    const windowText = lower.slice(i, i + maxLen);
    let matchCount = 0;
    for (const qt of queryTokens) {
      const count =
        windowText.split(qt.toLowerCase()).length - 1;
      matchCount += count;
    }
    if (matchCount > bestScore) {
      bestScore = matchCount;
      bestStart = i;
    }
  }

  let snippet = content.slice(bestStart, bestStart + maxLen);
  if (bestStart > 0) snippet = "..." + snippet;
  if (bestStart + maxLen < content.length) snippet += "...";
  return snippet;
}

// ---- Singleton ----

let instance: VaultSearchIndex | null = null;

export function getSearchIndex(vault?: Vault): VaultSearchIndex {
  if (!instance && vault) {
    instance = new VaultSearchIndex(vault);
  }
  return instance!;
}
