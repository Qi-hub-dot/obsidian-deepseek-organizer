// ============================================================
// 解析器路由
// ============================================================
import type { Parser } from "../types";
import { MarkdownParser } from "./markdown";
import { TextParser } from "./text";

/** 懒加载 PDF 解析器（pdfjs-dist 体积大，按需加载） */
let PdfParserCtor: (new () => Parser) | null = null;
async function getPdfParser(): Promise<Parser> {
  if (!PdfParserCtor) {
    const mod = await import("./pdf");
    PdfParserCtor = mod.PdfParser;
  }
  return new PdfParserCtor();
}

/** 懒加载 DOCX 解析器（mammoth 体积大，按需加载） */
let DocxParserCtor: (new () => Parser) | null = null;
async function getDocxParser(): Promise<Parser> {
  if (!DocxParserCtor) {
    const mod = await import("./docx");
    DocxParserCtor = mod.DocxParser;
  }
  return new DocxParserCtor();
}

/**
 * 根据文件扩展名获取对应解析器。
 * PDF 和 DOCX 解析器通过动态 import 延迟加载。
 */
export async function getParserForExtension(
  ext: string,
): Promise<Parser | null> {
  const normalized = ext.toLowerCase().replace(/^\./, "");

  switch (normalized) {
    case "md":
    case "markdown":
      return new MarkdownParser();
    case "txt":
    case "text":
      return new TextParser();
    case "pdf":
      return getPdfParser();
    case "docx":
    case "doc":
      return getDocxParser();
    default:
      return null;
  }
}

/**
 * 从文件名获取解析器。
 */
export async function getParserForFile(
  fileName: string,
): Promise<Parser | null> {
  const ext = fileName.split(".").pop() || "";
  return getParserForExtension(ext);
}

/**
 * 支持的导入扩展名列表。
 */
export const SUPPORTED_EXTENSIONS = [".md", ".txt", ".pdf", ".docx"];

/**
 * 判断文件是否可导入。
 */
export function isSupportedFile(fileName: string): boolean {
  const ext = "." + (fileName.split(".").pop() || "").toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(ext);
}
