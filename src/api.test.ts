// ============================================================
// DeepSeek API 客户端单元测试 — 使用 mock fetch
// ============================================================
import { DeepSeekClient } from "./api";
import { DeepSeekError } from "./types";
import type { ChatMessage } from "./types";

// 保存原始 fetch
const originalFetch = global.fetch;

function mockFetch(mockFn: typeof fetch): void {
  global.fetch = mockFn;
}

function restoreFetch(): void {
  global.fetch = originalFetch;
}

describe("DeepSeekClient", () => {
  const client = new DeepSeekClient(
    "https://api.deepseek.com",
    "sk-test-key",
    "deepseek-chat",
  );
  const messages: ChatMessage[] = [{ role: "user", content: "你好" }];

  afterEach(() => {
    restoreFetch();
  });

  test("非流式请求返回完整响应", async () => {
    mockFetch(async () => {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "你好，我是 DeepSeek！" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const result = await client.chat(messages, { stream: false });
    expect(typeof result).toBe("string");
    expect(result).toBe("你好，我是 DeepSeek！");
  });

  test("流式请求返回 AsyncGenerator", async () => {
    // 构造 SSE 流
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"choices":[{"delta":{"content":"你"}}]}\n\n' +
              'data: {"choices":[{"delta":{"content":"好"}}]}\n\n' +
              "data: [DONE]\n\n",
          ),
        );
        controller.close();
      },
    });

    mockFetch(async () => {
      return new Response(stream, { status: 200 });
    });

    const result = await client.chat(messages, { stream: true });
    expect(typeof result).toBe("object");
    expect(Symbol.asyncIterator in Object(result)).toBe(true);

    const chunks: string[] = [];
    for await (const chunk of result as AsyncGenerator<string>) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(["你", "好"]);
  });

  test("非流式空 choices 返回空字符串", async () => {
    mockFetch(async () => {
      return new Response(
        JSON.stringify({ choices: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const result = await client.chat(messages, { stream: false });
    expect(result).toBe("");
  });

  test("HTTP 401 抛出 DeepSeekError", async () => {
    mockFetch(async () => {
      return new Response(
        JSON.stringify({ error: { message: "Invalid API Key" } }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    });

    await expect(client.chat(messages)).rejects.toThrow(DeepSeekError);
    try {
      await client.chat(messages);
    } catch (err) {
      const de = err as DeepSeekError;
      expect(de.statusCode).toBe(401);
      expect(de.toUserMessage()).toContain("API Key 无效");
    }
  });

  test("HTTP 402 抛出配额不足错误", async () => {
    mockFetch(async () => {
      return new Response("{}", { status: 402 });
    });

    try {
      await client.chat(messages);
    } catch (err) {
      const de = err as DeepSeekError;
      expect(de.toUserMessage()).toContain("配额不足");
    }
  });

  test("HTTP 429 抛出频率限制错误", async () => {
    mockFetch(async () => {
      return new Response("{}", { status: 429 });
    });

    try {
      await client.chat(messages);
    } catch (err) {
      expect((err as DeepSeekError).toUserMessage()).toContain("频繁");
    }
  });

  test("网络错误抛出 DeepSeekError(statusCode=0)", async () => {
    mockFetch(async () => {
      throw new Error("Network error");
    });

    try {
      await client.chat(messages);
    } catch (err) {
      expect(err).toBeInstanceOf(DeepSeekError);
      expect((err as DeepSeekError).statusCode).toBe(0);
    }
  });

  test("AbortController 超时抛出 DeepSeekError", async () => {
    const controller = new AbortController();
    controller.abort(); // 立即中止

    await expect(
      client.chat(messages, { signal: controller.signal }),
    ).rejects.toThrow(DeepSeekError);

    try {
      await client.chat(messages, { signal: controller.signal });
    } catch (err) {
      expect((err as DeepSeekError).statusCode).toBe(0);
      expect((err as DeepSeekError).message).toBe("请求已超时");
    }
  });

  test("updateConfig 更新后使用新配置", async () => {
    let capturedUrl = "";
    mockFetch(async (input) => {
      capturedUrl = (input as Request).url;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    client.updateConfig("https://custom.api.com", "new-key", "new-model");
    await client.chat(messages, { stream: false });

    expect(capturedUrl).toContain("custom.api.com");
  });

  test("baseUrl 尾部斜杠被清理", async () => {
    const c = new DeepSeekClient(
      "https://api.deepseek.com/",
      "sk-key",
      "deepseek-chat",
    );
    let capturedUrl = "";

    mockFetch(async (input) => {
      capturedUrl = (input as Request).url;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    await c.chat(messages, { stream: false });
    // 不应出现双斜杠
    expect(capturedUrl).not.toContain("//v1");
    expect(capturedUrl).toContain("/v1/chat/completions");
  });
});
