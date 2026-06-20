// ============================================================
// 解析器路由单元测试
// ============================================================
import {
  getParserForExtension,
  getParserForFile,
  isSupportedFile,
  SUPPORTED_EXTENSIONS,
} from "./index";

describe("getParserForExtension", () => {
  test(".md 返回 MarkdownParser", async () => {
    const parser = await getParserForExtension("md");
    expect(parser).not.toBeNull();
  });

  test(".markdown 返回 MarkdownParser", async () => {
    const parser = await getParserForExtension("markdown");
    expect(parser).not.toBeNull();
  });

  test(".MD 大写也正常路由", async () => {
    const parser = await getParserForExtension("MD");
    expect(parser).not.toBeNull();
  });

  test(".txt 返回 TextParser", async () => {
    const parser = await getParserForExtension("txt");
    expect(parser).not.toBeNull();
  });

  test(".text 返回 TextParser", async () => {
    const parser = await getParserForExtension("text");
    expect(parser).not.toBeNull();
  });

  test("不支持的扩展名返回 null", async () => {
    const parser = await getParserForExtension("xyz");
    expect(parser).toBeNull();
  });

  test(".pdf 懒加载 PdfParser", async () => {
    const parser = await getParserForExtension("pdf");
    // 懒加载在 Node test env 可能因 pdfjs-dist 依赖失败，
    // 但路由逻辑本身应返回 parser 或抛出特定错误
    // 这里测试路由返回非 null
    expect(parser).not.toBeNull();
    // 验证它实现了 parse 方法
    expect(typeof parser?.parse).toBe("function");
  });

  test(".docx 懒加载 DocxParser", async () => {
    const parser = await getParserForExtension("docx");
    expect(parser).not.toBeNull();
    expect(typeof parser?.parse).toBe("function");
  });

  test("带点的扩展名 .md 正确路由", async () => {
    const parser = await getParserForExtension(".md");
    expect(parser).not.toBeNull();
  });
});

describe("getParserForFile", () => {
  test("从文件名正确提取扩展名", async () => {
    const parser = await getParserForFile("笔记.md");
    expect(parser).not.toBeNull();
  });

  test("不含扩展名的文件返回 null", async () => {
    const parser = await getParserForFile("README");
    expect(parser).toBeNull();
  });

  test("多级扩展名取最后一级", async () => {
    const parser = await getParserForFile("archive.tar.txt");
    // .txt → TextParser
    expect(parser).not.toBeNull();
  });
});

describe("isSupportedFile", () => {
  test(".md 支持", () => {
    expect(isSupportedFile("note.md")).toBe(true);
  });

  test(".pdf 支持", () => {
    expect(isSupportedFile("paper.pdf")).toBe(true);
  });

  test(".docx 支持", () => {
    expect(isSupportedFile("doc.docx")).toBe(true);
  });

  test(".html 不支持", () => {
    expect(isSupportedFile("page.html")).toBe(false);
  });

  test("空文件名不支持", () => {
    expect(isSupportedFile("")).toBe(false);
  });

  test("大写扩展名也支持", () => {
    expect(isSupportedFile("NOTE.MD")).toBe(true);
  });
});

describe("SUPPORTED_EXTENSIONS", () => {
  test("包含 4 种格式", () => {
    expect(SUPPORTED_EXTENSIONS).toEqual([".md", ".txt", ".pdf", ".docx"]);
  });
});
