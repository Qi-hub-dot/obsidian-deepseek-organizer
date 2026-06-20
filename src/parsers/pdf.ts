// ============================================================
// PDF 文件解析器 —— 使用 pdfjs-dist 提取文本
// ============================================================
import type { Parser } from "../types";

export class PdfParser implements Parser {
  async parse(arrayBuffer: ArrayBuffer): Promise<string> {
    // 动态导入 pdfjs-dist 以支持懒加载
    const pdfjsLib = await import("pdfjs-dist");

    // 设置 worker（使用内联 worker 或 CDN，避免文件系统依赖）
    // 注意：在 Obsidian 环境中，我们使用 pdfjs-dist 的 legacy build
    // 或直接不设置 worker（v4+ 支持无 worker 模式）
    // worker 路径置空，避免文件系统依赖和类型声明问题
    // pdfjs-dist v4+ 支持无 worker 模式（性能略降但兼容性更好）
    pdfjsLib.GlobalWorkerOptions.workerSrc = "";

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      // 禁用 worker 以避免跨域和路径问题（在 Capacitor 环境更安全）
      useWorkerFetch: false,
      disableAutoFetch: true,
      disableStream: true,
    });

    const pdf = await loadingTask.promise;
    const pages: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      const pageText = textContent.items
        .map((item: any) => ("str" in item ? item.str : ""))
        .filter(Boolean)
        .join(" ");

      if (pageText.trim()) {
        pages.push(`[第 ${i} 页]\n${pageText}`);
      }
    }

    return pages.join("\n\n---\n\n");
  }
}
