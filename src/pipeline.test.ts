// ============================================================
// 集成测试 — 拆分管线端到端 (mock Vault + mock fetch)
// ============================================================
import { parseSplitResult } from "./response-parser";
import { buildSplitPrompt } from "./prompts";
import { Sanitizer } from "./sanitizer";
import type { SplitNote, SanitizerRule } from "./types";

/**
 * 模拟完整的拆分管线（含脱敏、prompt 构建、API 调用、响应解析）。
 * 不依赖真实 Obsidian Vault，仅测试核心逻辑链路。
 */

const MOCK_SPLIT_RESPONSE = `
以下是拆分结果：

\`\`\`json
[
  {
    "title": "机器学习基础",
    "content": "机器学习是人工智能的一个重要分支，通过数据驱动的方式让计算机从经验中学习。",
    "tags": ["AI", "机器学习", "基础"]
  },
  {
    "title": "深度学习概述",
    "content": "深度学习是机器学习的子集，使用多层神经网络进行模式识别和特征提取。",
    "tags": ["AI", "深度学习", "神经网络"]
  },
  {
    "title": "应用场景",
    "content": "AI 技术广泛应用于医疗、金融、自动驾驶等领域。",
    "tags": ["AI", "应用", "行业"]
  }
]
\`\`\`
`;

const SAMPLE_DOCUMENT = `
# 人工智能技术概述

机器学习是人工智能的一个重要分支，通过数据驱动的方式让计算机从经验中学习。

深度学习是机器学习的子集，使用多层神经网络进行模式识别和特征提取。

AI 技术广泛应用于医疗、金融、自动驾驶等领域。
`;

const SANITIZER_RULES: SanitizerRule[] = [
  {
    id: "phone",
    name: "手机号",
    regex: "1[3-9]\\d{9}",
    replacement: "[手机号]",
    enabled: true,
  },
  {
    id: "email",
    name: "邮箱",
    regex: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
    replacement: "[邮箱]",
    enabled: true,
  },
];

describe("拆分管线集成测试 (mock)", () => {
  test("文档 → 脱敏 → Prompt → 响应解析 → SplitNote[]", () => {
    // Step 1: 脱敏
    const { sanitized, count } = Sanitizer.sanitizeWithRules(
      SAMPLE_DOCUMENT,
      SANITIZER_RULES,
    );
    expect(count).toBe(0); // 本文档不含敏感信息
    expect(sanitized).toBe(SAMPLE_DOCUMENT);

    // Step 2: 构建 Prompt
    const messages = buildSplitPrompt("test.md", sanitized, "medium");
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].content).toContain("人工智能");

    // Step 3: 模拟 API 响应
    // (实际调用 DeepSeekClient 已在 api.test.ts 中覆盖)

    // Step 4: 解析响应
    const notes: SplitNote[] = parseSplitResult(MOCK_SPLIT_RESPONSE);
    expect(notes).toHaveLength(3);
    expect(notes[0].title).toBe("机器学习基础");
    expect(notes[0].tags).toContain("AI");
    expect(notes[0].content.length).toBeGreaterThan(0);
    expect(notes[2].title).toBe("应用场景");
  });

  test("含敏感信息的文档被脱敏后传入 Prompt", () => {
    const docWithPII =
      "请联系统我 13812345678 或发邮件到 user@example.com。\n\n" +
      SAMPLE_DOCUMENT;

    const { sanitized, count } = Sanitizer.sanitizeWithRules(
      docWithPII,
      SANITIZER_RULES,
    );
    expect(count).toBe(2);
    expect(sanitized).not.toContain("13812345678");
    expect(sanitized).not.toContain("user@example.com");
    expect(sanitized).toContain("[手机号]");
    expect(sanitized).toContain("[邮箱]");

    // 脱敏后的文本仍包含有效内容
    const messages = buildSplitPrompt("doc.md", sanitized);
    expect(messages[1].content).toContain("人工智能");
  });

  test("API 返回畸形 JSON 时降级为单条笔记", () => {
    const malformedResponse = "API 返回了非 JSON 格式的总结文本...";
    const notes = parseSplitResult(malformedResponse);

    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe("导入笔记");
    expect(notes[0].content).toBe(malformedResponse);
    expect(notes[0].tags).toEqual([]);
  });

  test("拆分结果去重（相同标题检测）", () => {
    const duplicateResponse = `\`\`\`json
[
  {"title": "机器学习", "content": "内容 A", "tags": ["AI"]},
  {"title": "机器学习", "content": "内容 B", "tags": ["AI"]}
]
\`\`\``;

    const notes = parseSplitResult(duplicateResponse);
    expect(notes).toHaveLength(2);
    // 去重应在 writeNotes 层处理，这里只验证解析正确
    const titles = notes.map((n) => n.title);
    expect(titles.filter((t) => t === "机器学习")).toHaveLength(2);
  });
});

describe("标签建议管线集成测试 (mock)", () => {
  test("解析器正确处理带置信度的标签", () => {
    const { parseTagSuggestions } = require("./response-parser");
    const mockResponse = `\`\`\`json
[
  {"tag": "AI", "confidence": 0.95, "reason": "文中多次提及人工智能"},
  {"tag": "机器学习", "confidence": 0.88, "reason": "核心主题"},
  {"tag": "深度学习", "confidence": 0.72, "reason": "提及了神经网络"}
]
\`\`\``;

    const suggestions = parseTagSuggestions(mockResponse);
    expect(suggestions).toHaveLength(3);
    // 置信度排序
    expect(suggestions[0].confidence).toBeGreaterThanOrEqual(
      suggestions[1].confidence,
    );
    expect(suggestions[1].confidence).toBeGreaterThanOrEqual(
      suggestions[2].confidence,
    );
  });
});

describe("链接建议管线集成测试 (mock)", () => {
  test("解析器正确提取链接建议", () => {
    const { parseLinkSuggestions } = require("./response-parser");
    const { buildLinkSuggestionPrompt } = require("./prompts");

    const vaultTitles = ["AI 概述", "深度学习笔记", "数学基础"];
    const messages = buildLinkSuggestionPrompt(
      "机器学习是人工智能的核心...",
      vaultTitles,
    );

    expect(messages[0].content).toContain("AI 概述");
    expect(messages[0].content).toContain("深度学习笔记");

    const mockResponse = `\`\`\`json
[
  {"targetNote": "AI 概述", "snippet": "人工智能包含机器学习", "reason": "主题包含关系"},
  {"targetNote": "深度学习笔记", "snippet": "多层神经网络", "reason": "技术关联"}
]
\`\`\``;

    const links = parseLinkSuggestions(mockResponse);
    expect(links).toHaveLength(2);
    expect(links[0].targetNote).toBe("AI 概述");
  });
});
