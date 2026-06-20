// ============================================================
// 纯文本文件解析器
// ============================================================
import type { Parser } from "../types";

export class TextParser implements Parser {
  async parse(arrayBuffer: ArrayBuffer): Promise<string> {
    const decoder = new TextDecoder("utf-8");
    return decoder.decode(arrayBuffer);
  }
}
