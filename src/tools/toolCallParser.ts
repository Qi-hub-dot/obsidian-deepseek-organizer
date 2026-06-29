// ============================================================
// Tool Call Parser & Executor
// 解析 AI 响应中的 <tool_call> 块，执行工具，注入结果
// ============================================================
import { getToolRegistry } from "./ToolRegistry";
import type DeepSeekPlugin from "../../main";

export interface ParsedToolCall {
  name: string;
  args: Record<string, unknown>;
  /** Raw matched text in the response */
  rawMatch: string;
}

export interface ToolCallResult {
  call: ParsedToolCall;
  output: string;
  error?: string;
  elapsedMs: number;
}

/**
 * Parse <tool_call> blocks from AI response text.
 * Format: <tool_call>{"name":"searchVault","args":{"query":"xxx"}}</tool_call>
 */
export function parseToolCalls(text: string): ParsedToolCall[] {
  const results: ParsedToolCall[] = [];
  const regex = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    try {
      const json = JSON.parse(match[1]);
      if (json.name && typeof json.name === "string") {
        results.push({
          name: json.name,
          args: json.args || {},
          rawMatch: match[0],
        });
      }
    } catch {
      // Invalid JSON — skip
    }
  }

  return results;
}

/**
 * Execute a parsed tool call and return the result.
 */
export async function executeToolCall(
  call: ParsedToolCall,
  plugin: DeepSeekPlugin,
): Promise<ToolCallResult> {
  const start = Date.now();
  const registry = getToolRegistry();

  try {
    const output = await registry.execute(call.name, call.args, plugin);
    return { call, output, elapsedMs: Date.now() - start };
  } catch (err) {
    return {
      call,
      output: "",
      error: err instanceof Error ? err.message : "执行失败",
      elapsedMs: Date.now() - start,
    };
  }
}

/**
 * Generate the tools section for the system prompt.
 */
export function buildToolsPrompt(): string {
  const registry = getToolRegistry();
  const tools = registry.getAll();
  if (tools.length === 0) return "";

  const toolDescs = tools
    .map((t) => {
      const params = Object.entries(t.parameters)
        .map(([k, v]: [string, any]) => `    "${k}": ${v.type} — ${v.description || ""}`)
        .join("\n");
      return `- **${t.name}**: ${t.description}\n  参数:\n${params}`;
    })
    .join("\n\n");

  return `
## 可用工具
你可以调用以下工具来帮助用户完成任务。调用格式：
\`\`\`
<tool_call>{"name":"工具名","args":{"参数名":"参数值"}}</tool_call>
\`\`\`

${toolDescs}

## 笔记创建流程（重要）
当用户要求「生成笔记/创建笔记/整理成笔记/帮我做笔记」时：
1. **先搜一次**：用 searchVault 搜一次，提取用户问题中的关键词作 query
2. **快速判断**：看搜索结果标题是否和用户要处理的主题有关
   - 标题和主题完全无关 → 立刻停止搜索，直接 createNote
   - 可能相关 → 保留 2-3 条作 [[链接]]，然后立刻 createNote
3. **不要反复搜**：一次搜索就够了！无论什么结果都立刻进入创建
4. 搜索 + 创建可以在**同一轮**完成，不要分成两轮

**⚠️ 创建笔记的关键规则（必须遵守）：**
- 笔记的完整正文（标题、标签、全部内容、链接）要**全部放在 content 参数里**
- **不要在 <tool_call> 前面写正文！**正文只在 content 参数中
- 正确示例：
<tool_call>{"name":"createNote","args":{"path":"学习/线性代数.md","content":"---\\ntitle: 线性代数笔记\\ndate: 2025-01-01\\ntags: [数学, 线性代数]\\n---\\n\\n# 线性代数核心概念\\n\\n## 向量空间\\n具体内容...\\n\\n## 矩阵运算\\n更多...\\n\\n## 相关笔记\\n- [[高等数学]]\\n- [[矩阵论]]"}}</tool_call>
- content 里用 \\n 表示换行
- 标题要有意义（从内容提炼），**禁止**用「AI 生成的笔记」之类泛称
- 路径要按主题分类，如「编程/Python.md」「历史/明朝.md」

**其他规则：**
- 工具结果为空/未找到 → 继续下一步，不要反复重试
- 日常闲聊不需要工具 → 直接回答
`;
}
