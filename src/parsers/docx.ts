// ============================================================
// DOCX 文件解析器 —— 使用 mammoth 提取文本
// ============================================================
import type { Parser } from "../types";

export class DocxParser implements Parser {
  async parse(arrayBuffer: ArrayBuffer): Promise<string> {
    const mammoth = await import("mammoth");

    const result = await mammoth.extractRawText({
      arrayBuffer: arrayBuffer as ArrayBuffer,
    });

    return result.value || "";
  }
}
