// ============================================================
// CustomCommandManager — reusable prompt templates
// ============================================================
import { TFile, type Vault } from "obsidian";

export interface CustomCommand {
  id: string;
  name: string;
  prompt: string;
  icon?: string;
  /** Category for grouping */
  category?: string;
}

const COMMANDS_FILE = ".deepseek-commands.json";

export class CustomCommandManager {
  private commands: CustomCommand[] = [];
  private vault: Vault;

  constructor(vault: Vault) {
    this.vault = vault;
  }

  async initialize(): Promise<void> {
    try {
      const file = this.vault.getAbstractFileByPath(COMMANDS_FILE);
      if (file instanceof TFile) {
        const raw = await this.vault.read(file);
        this.commands = JSON.parse(raw).commands || [];
      } else {
        // Create with defaults
        this.commands = getDefaultCommands();
        await this.save();
      }
    } catch {
      this.commands = getDefaultCommands();
    }
  }

  getAll(): CustomCommand[] {
    return this.commands;
  }

  get(id: string): CustomCommand | undefined {
    return this.commands.find((c) => c.id === id);
  }

  async add(cmd: CustomCommand): Promise<void> {
    // Replace if exists
    const idx = this.commands.findIndex((c) => c.id === cmd.id);
    if (idx >= 0) {
      this.commands[idx] = cmd;
    } else {
      this.commands.push(cmd);
    }
    await this.save();
  }

  async remove(id: string): Promise<void> {
    this.commands = this.commands.filter((c) => c.id !== id);
    await this.save();
  }

  async save(): Promise<void> {
    const content = JSON.stringify(
      { commands: this.commands },
      null,
      2,
    );
    const existing = this.vault.getAbstractFileByPath(COMMANDS_FILE);
    if (existing instanceof TFile) {
      await this.vault.modify(existing, content);
    } else {
      await this.vault.create(COMMANDS_FILE, content);
    }
  }
}

function getDefaultCommands(): CustomCommand[] {
  return [
    {
      id: "summarize",
      name: "📝 生成摘要",
      prompt: "请为以下内容生成简洁的摘要（3-5句话），抓住核心观点：\n\n{{selection}}",
      category: "笔记处理",
    },
    {
      id: "explain",
      name: "💡 解释概念",
      prompt: "请用通俗易懂的语言解释以下内容，适合初学者理解：\n\n{{selection}}",
      category: "学习",
    },
    {
      id: "translate-en",
      name: "🌐 翻译为英文",
      prompt: "请将以下中文翻译为英文，保持原意和风格：\n\n{{selection}}",
      category: "翻译",
    },
    {
      id: "translate-zh",
      name: "🌐 翻译为中文",
      prompt: "Please translate the following to Chinese, preserving meaning and style:\n\n{{selection}}",
      category: "翻译",
    },
    {
      id: "improve-writing",
      name: "✍️ 润色优化",
      prompt: "请润色以下文本，使其更加流畅、专业、有表达力。保持原意不变：\n\n{{selection}}",
      category: "写作",
    },
    {
      id: "outline",
      name: "📋 生成大纲",
      prompt: "请为以下内容生成一个结构清晰的 Markdown 大纲：\n\n{{selection}}",
      category: "笔记处理",
    },
    {
      id: "action-items",
      name: "✅ 提取行动项",
      prompt: "请从以下内容中提取所有待办事项和行动项，并用列表呈现：\n\n{{selection}}",
      category: "笔记处理",
    },
    {
      id: "key-takeaways",
      name: "🔑 关键要点",
      prompt: "请用 3-5 个要点提炼以下内容的核心信息：\n\n{{selection}}",
      category: "笔记处理",
    },
  ];
}
