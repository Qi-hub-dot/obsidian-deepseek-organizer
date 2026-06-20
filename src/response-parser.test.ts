// ============================================================
// 响应解析器单元测试
// ============================================================
import {
  parseSplitResult,
  parseTagSuggestions,
  parseLinkSuggestions,
} from "./response-parser";

describe("parseSplitResult", () => {
  test("正常 JSON 数组解析", () => {
    const raw = `[
      {"title": "机器学习基础", "content": "ML 是 AI 的一个分支...", "tags": ["AI", "ML"]},
      {"title": "深度学习", "content": "DL 使用多层神经网络...", "tags": ["AI", "DL"]}
    ]`;
    const result = parseSplitResult(raw);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("机器学习基础");
    expect(result[0].tags).toEqual(["AI", "ML"]);
    expect(result[1].title).toBe("深度学习");
  });

  test("Markdown 代码块包裹的 JSON", () => {
    const raw = "以下是拆分结果：\n```json\n[{\"title\":\"测试\", \"content\":\"内容\", \"tags\":[\"A\"]}]\n```";
    const result = parseSplitResult(raw);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("测试");
  });

  test("单对象自动包装为数组", () => {
    const raw = `{"title": "单条笔记", "content": "内容", "tags": []}`;
    const result = parseSplitResult(raw);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("单条笔记");
  });

  test("缺少 title 字段回退", () => {
    const raw = `[{"content": "无标题"}]`;
    const result = parseSplitResult(raw);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("笔记 1");
  });

  test("畸形 JSON 降级为单条", () => {
    const raw = "这不是 JSON 内容，这是纯文本响应。";
    const result = parseSplitResult(raw);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("导入笔记");
    expect(result[0].content).toBe(raw);
    expect(result[0].tags).toEqual([]);
  });
});

describe("parseTagSuggestions", () => {
  test("正常解析", () => {
    const raw = `[
      {"tag": "AI", "confidence": 0.95, "reason": "文中多次提及人工智能"},
      {"tag": "笔记方法论", "confidence": 0.7, "reason": "讨论了笔记整理"}
    ]`;
    const result = parseTagSuggestions(raw);
    expect(result).toHaveLength(2);
    expect(result[0].tag).toBe("AI");
    expect(result[0].confidence).toBe(0.95);
    expect(result[1].confidence).toBe(0.7);
  });

  test("降级路径：纯文本按行解析", () => {
    const raw = "AI\n机器学习\n知识管理";
    const result = parseTagSuggestions(raw);
    expect(result).toHaveLength(3);
    expect(result[0].tag).toBe("AI");
    expect(result[0].confidence).toBe(0.5);
  });
});

describe("parseLinkSuggestions", () => {
  test("正常解析", () => {
    const raw = `[
      {"targetNote": "AI 概述", "snippet": "机器学习是人工智能的重要分支", "reason": "主题相关"},
      {"targetNote": "深度学习笔记", "snippet": "神经网络", "reason": "内容延续"}
    ]`;
    const result = parseLinkSuggestions(raw);
    expect(result).toHaveLength(2);
    expect(result[0].targetNote).toBe("AI 概述");
    expect(result[0].reason).toBe("主题相关");
  });

  test("降级路径：提取 [[wiki link]]", () => {
    const raw = "建议链接到 [[AI 概述]] 和 [[深度学习笔记]]。";
    const result = parseLinkSuggestions(raw);
    expect(result).toHaveLength(2);
    expect(result[0].targetNote).toBe("AI 概述");
    expect(result[1].targetNote).toBe("深度学习笔记");
  });
});
