// ============================================================
// ToolRegistry — lightweight tool framework for AI function calling
// ============================================================
import type DeepSeekPlugin from "../../main";

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema for parameters */
  parameters: Record<string, unknown>;
  execute: (params: Record<string, unknown>, plugin: DeepSeekPlugin) => Promise<string>;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDef>();

  register(tool: ToolDef): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDef[] {
    return [...this.tools.values()];
  }

  /** Build OpenAI-compatible tools JSON for function calling */
  toOpenAITools(): Array<Record<string, unknown>> {
    return this.getAll().map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: "object",
          properties: t.parameters,
          required: Object.keys(t.parameters),
        },
      },
    }));
  }

  /** Execute a tool by name and return result */
  async execute(
    name: string,
    params: Record<string, unknown>,
    plugin: DeepSeekPlugin,
  ): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) return `Error: unknown tool "${name}"`;
    try {
      return await tool.execute(params, plugin);
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : "unknown"}`;
    }
  }
}

// ---- Singleton ----

let instance: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!instance) instance = new ToolRegistry();
  return instance;
}
