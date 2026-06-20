// ============================================================
// Prompt 模板单元测试
// ============================================================
import {
  buildSplitPrompt,
  buildChatContext,
  buildSummarizePrompt,
  buildTagSuggestionPrompt,
  buildLinkSuggestionPrompt,
  buildPolishPrompt,
  buildDedupPrompt,
} from "./prompts";

describe("buildSplitPrompt", () => {
  const content = "# AI\n机器学习是人工智能的一个分支。\n\n# 深度学习\n深度学习使用多层神经网络。";

  test("默认 medium 粒度", () => {
    const msgs = buildSplitPrompt("test.md", content);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain("中等粒度");
    expect(msgs[1].role).toBe("user");
    expect(msgs[1].content).toContain("test.md");
    expect(msgs[1].content).toContain("机器学习");
  });

  test("coarse 粒度", () => {
    const msgs = buildSplitPrompt("test.md", content, "coarse");
    expect(msgs[0].content).toContain("较高层级");
  });

  test("fine 粒度", () => {
    const msgs = buildSplitPrompt("test.md", content, "fine");
    expect(msgs[0].content).toContain("精细拆分");
  });

  test("长文本自动截断在 50000 字符", () => {
    const longContent = "x".repeat(60000);
    const msgs = buildSplitPrompt("long.md", longContent);
    const userContent = msgs[1].content;
    const docContent = userContent.split("```")[1];
    expect(docContent.length).toBeLessThanOrEqual(50100);
  });
});

describe("buildChatContext", () => {
  test("有笔记内容时注入 system prompt", () => {
    const msgs = buildChatContext("这是笔记内容", "帮我总结");
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain("这是笔记内容");
    expect(msgs[1].role).toBe("user");
    expect(msgs[1].content).toBe("帮我总结");
  });

  test("无笔记内容时使用通用 system prompt", () => {
    const msgs = buildChatContext(null, "你好");
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toContain("帮助用户管理笔记");
    expect(msgs[0].content).not.toContain("当前笔记");
  });
});

describe("buildSummarizePrompt", () => {
  const content = "深度学习是机器学习的一个子集...";

  test("concise 风格", () => {
    const msgs = buildSummarizePrompt(content, "concise");
    expect(msgs[0].content).toContain("精简摘要");
    expect(msgs[1].content).toContain("精简");
  });

  test("detailed 风格", () => {
    const msgs = buildSummarizePrompt(content, "detailed");
    expect(msgs[0].content).toContain("详细摘要");
    expect(msgs[1].content).toContain("详细");
  });

  test("outline 风格", () => {
    const msgs = buildSummarizePrompt(content, "outline");
    expect(msgs[0].content).toContain("层级大纲");
    expect(msgs[1].content).toContain("大纲式");
  });

  test("内容截断在 30000 字符", () => {
    const long = "y".repeat(40000);
    const msgs = buildSummarizePrompt(long, "concise");
    expect(msgs[1].content.length).toBeLessThanOrEqual(30100);
  });
});

describe("buildTagSuggestionPrompt", () => {
  test("有已有标签时不重复建议", () => {
    const msgs = buildTagSuggestionPrompt("笔记内容", ["AI", "ML"]);
    expect(msgs[0].content).toContain("AI、ML");
    expect(msgs[0].content).toContain("不要重复建议");
  });

  test("无已有标签时正常处理", () => {
    const msgs = buildTagSuggestionPrompt("内容", []);
    expect(msgs[0].content).toContain("（无）");
  });
});

describe("buildLinkSuggestionPrompt", () => {
  test("限制 200 篇笔记标题", () => {
    const titles = Array.from({ length: 300 }, (_, i) => `笔记 ${i}`);
    const msgs = buildLinkSuggestionPrompt("当前笔记", titles);
    // 标题列表应被截断到 200
    const systemContent = msgs[0].content;
    const count = (systemContent.match(/- 笔记/g) || []).length;
    expect(count).toBeLessThanOrEqual(200);
  });

  test("正确包含关联理由要求", () => {
    const msgs = buildLinkSuggestionPrompt("笔记A", ["笔记B", "笔记C"]);
    expect(msgs[0].content).toContain("关联理由");
    expect(msgs[1].content).toContain("笔记A");
  });
});

describe("buildPolishPrompt", () => {
  const text = "这段文本需要润色。";

  test("improve 模式", () => {
    const msgs = buildPolishPrompt(text, "improve");
    expect(msgs[0].content).toContain("润色");
    expect(msgs[0].content).toContain("流畅、专业");
  });

  test("shorten 模式", () => {
    const msgs = buildPolishPrompt(text, "shorten");
    expect(msgs[0].content).toContain("精简");
    expect(msgs[1].content).toContain("精简");
  });

  test("expand 模式", () => {
    const msgs = buildPolishPrompt(text, "expand");
    expect(msgs[0].content).toContain("扩展");
  });

  test("fix-grammar 模式", () => {
    const msgs = buildPolishPrompt(text, "fix-grammar");
    expect(msgs[0].content).toContain("语法和拼写错误");
    expect(msgs[0].content).toContain("不做风格改动");
  });

  test("输出 JSON 格式要求", () => {
    const msgs = buildPolishPrompt(text, "improve");
    expect(msgs[0].content).toContain("original");
    expect(msgs[0].content).toContain("polished");
  });
});

describe("buildDedupPrompt", () => {
  test("生成去重对比 prompt", () => {
    const msgs = buildDedupPrompt("笔记A内容", "笔记B内容");
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toContain("查重");
    expect(msgs[0].content).toContain("similarity");
    expect(msgs[0].content).toContain("merge");
    expect(msgs[1].content).toContain("笔记A");
    expect(msgs[1].content).toContain("笔记B");
  });

  test("内容截断在 10000 字符", () => {
    const long = "z".repeat(15000);
    const msgs = buildDedupPrompt(long, long);
    const userContent = msgs[1].content;
    // 各截断到 10000，所以总长度不会超过约 20300
    expect(userContent.length).toBeLessThan(22000);
  });
});
