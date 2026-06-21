// ============================================================
// 联网搜索 —— 多源聚合 + 页面内容抓取
// ============================================================

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  /** 从页面抓取的额外上下文（如果有） */
  extraContext?: string;
}

interface SearchProvider {
  name: string;
  search(query: string): Promise<SearchResult[]>;
}

// ============================================================
// Provider 1: DuckDuckGo Instant Answer API（免费、无需 Key）
// ============================================================
const ddgSearch: SearchProvider = {
  name: "DuckDuckGo",
  async search(query: string): Promise<SearchResult[]> {
    const q = encodeURIComponent(query);
    const url = `https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!resp.ok) return [];

      const data = await resp.json();
      const results: SearchResult[] = [];

      // AbstractText: 主要摘要（百科级别）
      if (data.AbstractText?.trim()) {
        results.push({
          title: data.Heading || query,
          url: data.AbstractURL || "",
          snippet: data.AbstractText.slice(0, 500),
        });
      }

      // RelatedTopics: 相关条目（实际搜索结果）
      const topics: Array<{
        Text?: string; FirstURL?: string; Topics?: unknown[];
      }> = data.RelatedTopics || [];

      for (const topic of topics) {
        if (results.length >= 8) break;
        // 嵌套子主题
        if (topic.Topics && Array.isArray(topic.Topics)) {
          for (const sub of topic.Topics as Array<{ Text?: string; FirstURL?: string }>) {
            if (results.length >= 8) break;
            const text = (sub.Text || "").replace(/<[^>]+>/g, "").trim();
            if (text && text.length > 10) {
              const parts = text.split(" - ");
              results.push({
                title: parts[0]?.slice(0, 100) || text.slice(0, 100),
                url: sub.FirstURL || "",
                snippet: parts.slice(1).join(" - ").slice(0, 400) || text.slice(0, 400),
              });
            }
          }
          continue;
        }
        const text = (topic.Text || "").replace(/<[^>]+>/g, "").trim();
        if (text && text.length > 10) {
          const parts = text.split(" - ");
          results.push({
            title: parts[0]?.slice(0, 100) || text.slice(0, 100),
            url: topic.FirstURL || "",
            snippet: parts.slice(1).join(" - ").slice(0, 400) || text.slice(0, 400),
          });
        }
      }

      return results;
    } catch {
      return [];
    }
  },
};

// ============================================================
// Provider 2: Wikipedia API（补充百科知识）
// ============================================================
const wikiSearch: SearchProvider = {
  name: "Wikipedia",
  async search(query: string): Promise<SearchResult[]> {
    const q = encodeURIComponent(query);
    const url =
      `https://zh.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q}&format=json&origin=*&srlimit=5`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!resp.ok) return [];

      const data = await resp.json();
      const items: Array<{ title: string; snippet: string; pageid: number }> =
        data.query?.search || [];

      return items.slice(0, 5).map((item) => ({
        title: item.title,
        url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
        snippet: item.snippet.replace(/<[^>]+>/g, "").trim().slice(0, 400),
      }));
    } catch {
      return [];
    }
  },
};

// ============================================================
// 搜索路由：聚合多个 Provider 结果
// ============================================================
const providers: SearchProvider[] = [ddgSearch, wikiSearch];

/**
 * 执行联网搜索，聚合多个来源的结果。
 * 返回去重后的搜索结果（最多 10 条）。
 */
export async function searchWeb(query: string): Promise<SearchResult[]> {
  const resultsMap = new Map<string, SearchResult>();

  // 并行搜索所有 provider
  const allResults = await Promise.all(
    providers.map((p) =>
      p.search(query).catch(() => [] as SearchResult[]),
    ),
  );

  // 按 URL 去重，保留第一个（最详细的）结果
  for (const batch of allResults) {
    for (const r of batch) {
      const key = r.url || r.title;
      if (!resultsMap.has(key)) {
        resultsMap.set(key, r);
        if (resultsMap.size >= 10) break;
      }
    }
    if (resultsMap.size >= 10) break;
  }

  return [...resultsMap.values()];
}

/**
 * 将搜索结果格式化为可直接注入 system prompt 的文本片段。
 * 格式设计为 AI 易于理解和引用的形式。
 */
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return "";

  const lines = ["\n[联网搜索结果 — 请基于以下最新信息回答]"];
  results.forEach((r, i) => {
    lines.push(`${i + 1}. **${r.title}**`);
    if (r.url) lines.push(`   来源: ${r.url}`);
    lines.push(`   ${r.snippet}`);
    if (r.extraContext) {
      lines.push(`   更多: ${r.extraContext.slice(0, 300)}`);
    }
  });
  lines.push("[/联网搜索结果]\n");
  return lines.join("\n");
}

/**
 * 尝试从搜索结果 URL 抓取页面文本内容（用于深度参考）。
 * 仅抓取 HTML 页面的纯文本部分，忽略图片/脚本/样式。
 */
export async function fetchPageContent(
  url: string,
  maxChars = 3000,
): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "text/html" },
    });
    clearTimeout(timeout);

    if (!resp.ok) return "";

    const html = await resp.text();
    // 简单文本提取：移除 script、style、HTML 标签
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return text.slice(0, maxChars);
  } catch {
    return "";
  }
}
