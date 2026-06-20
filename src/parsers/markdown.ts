// ============================================================
// Markdown 文件解析器
// ============================================================
import type { Parser } from "../types";

export class MarkdownParser implements Parser {
  async parse(arrayBuffer: ArrayBuffer): Promise<string> {
    const decoder = new TextDecoder("utf-8");
    return decoder.decode(arrayBuffer);
  }
}
