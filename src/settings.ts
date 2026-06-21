import { App, PluginSettingTab, Setting } from "obsidian";
import type DeepSeekPlugin from "../main";
import type { SanitizerRule, ChatMessage } from "./types";

export interface DeepSeekSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  reasoningEffort: string;
  sanitizerEnabled: boolean;
  sanitizerRules: SanitizerRule[];
  defaultTargetFolder: string;
  conversations: Record<string, ChatMessage[]>;
  savedConversations: Array<{ id: string; title: string; messages: ChatMessage[]; timestamp: number }>;
  memoryEnabled: boolean;
  memoryFolder: string;
  memoryMaxSizeMB: number;
}

export const DEFAULT_SETTINGS: DeepSeekSettings = {
  apiKey: "",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-chat",
  reasoningEffort: "medium",
  sanitizerEnabled: true,
  sanitizerRules: [
    { id: "phone", name: "手机号", regex: "1[3-9]\\d{9}", replacement: "[手机号]", enabled: true },
    { id: "idcard", name: "身份证号", regex: "\\d{17}[\\dXx]", replacement: "[身份证号]", enabled: true },
    { id: "email", name: "邮箱", regex: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}", replacement: "[邮箱]", enabled: true },
    { id: "ip", name: "IP 地址", regex: "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b", replacement: "[IP地址]", enabled: true },
  ],
  defaultTargetFolder: "知识库",
  conversations: {},
  savedConversations: [],
  memoryEnabled: true,
  memoryFolder: "记忆",
  memoryMaxSizeMB: 100,
};

export class DeepSeekSettingTab extends PluginSettingTab {
  plugin: DeepSeekPlugin;
  constructor(app: App, plugin: DeepSeekPlugin) { super(app, plugin); this.plugin = plugin; }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    containerEl.createEl("h2", { text: "API 配置" });

    new Setting(containerEl)
      .setName("API Base URL")
      .setDesc("DeepSeek API 端点地址。默认 https://api.deepseek.com")
      .addText((text) => text.setPlaceholder("https://api.deepseek.com").setValue(s.baseUrl)
        .onChange(async (value) => { s.baseUrl = value || "https://api.deepseek.com"; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName("API Key")
      .setDesc("DeepSeek API Key。也可通过环境变量 DEEPSEEK_API_KEY 设置（优先级更高）。")
      .addText((text) => { text.inputEl.type = "password"; text.setPlaceholder("sk-...").setValue(s.apiKey)
        .onChange(async (value) => { s.apiKey = value; await this.plugin.saveSettings(); }); return text; });

    new Setting(containerEl)
      .setName("模型选择")
      .setDesc("⚡ V4 Flash = 快速响应 | 🧠 V4 Pro = 深度推理。聊天面板可一键切换。")
      .addDropdown((dropdown) => {
        dropdown.addOption("deepseek-chat", "⚡ V4 Flash (deepseek-chat)");
        dropdown.addOption("deepseek-reasoner", "🧠 V4 Pro (deepseek-reasoner)");
        dropdown.addOption("__custom__", "🔧 自定义模型...");
        if (s.model && s.model !== "deepseek-chat" && s.model !== "deepseek-reasoner") {
          dropdown.addOption(s.model, "🔧 " + s.model + " (当前)");
        }
        dropdown.setValue(["deepseek-chat", "deepseek-reasoner"].includes(s.model) ? s.model : "__custom__");
        dropdown.onChange(async (value) => {
          if (value === "__custom__") { s.model = s.model || "deepseek-chat"; }
          else { s.model = value; }
          await this.plugin.saveSettings();
          this.display();
        });
      });

    if (!["deepseek-chat", "deepseek-reasoner"].includes(s.model)) {
      new Setting(containerEl)
        .setName("自定义模型名")
        .setDesc("输入完整的模型 ID。")
        .addText((text) => text.setPlaceholder("deepseek-chat").setValue(s.model)
          .onChange(async (value) => { s.model = value || "deepseek-chat"; await this.plugin.saveSettings(); }));
    }

    if (s.model === "deepseek-reasoner") {
      new Setting(containerEl)
        .setName("推理强度 (Reasoning Effort)")
        .setDesc("仅 V4 Pro 生效。high = 更深推理（慢），low = 快速推理。")
        .addDropdown((dropdown) => {
          dropdown.addOption("low", "Low — 快速");
          dropdown.addOption("medium", "Medium — 均衡 (推荐)");
          dropdown.addOption("high", "High — 深度");
          dropdown.setValue(s.reasoningEffort || "medium");
          dropdown.onChange(async (value) => { s.reasoningEffort = value; await this.plugin.saveSettings(); });
        });
    }

    containerEl.createEl("h2", { text: "隐私脱敏" });
    new Setting(containerEl)
      .setName("启用脱敏")
      .setDesc("发送内容到 API 前自动过滤敏感信息")
      .addToggle((toggle) => toggle.setValue(s.sanitizerEnabled).onChange(async (value) => { s.sanitizerEnabled = value; await this.plugin.saveSettings(); this.display(); }));

    if (s.sanitizerEnabled) {
      s.sanitizerRules.forEach((rule, index) => {
        new Setting(containerEl)
          .setName(rule.name).setDesc(`替换为：「${rule.replacement}」`)
          .addToggle((toggle) => toggle.setValue(rule.enabled).onChange(async (value) => { s.sanitizerRules[index].enabled = value; await this.plugin.saveSettings(); }));
      });
    }

    containerEl.createEl("h2", { text: "导入配置" });
    new Setting(containerEl)
      .setName("默认目标目录")
      .setDesc("导入并拆分后的笔记默认存放目录")
      .addText((text) => text.setPlaceholder("知识库").setValue(s.defaultTargetFolder)
        .onChange(async (value) => { s.defaultTargetFolder = value || "知识库"; await this.plugin.saveSettings(); }));

    containerEl.createEl("h2", { text: "记忆缓存" });
    containerEl.createEl("p", { text: "AI 助手会自动记住对话关键信息，下次对话时检索相关记忆。", attr: { style: "color: var(--text-muted); font-size: 0.85em; margin-bottom: 8px;" } });

    new Setting(containerEl)
      .setName("启用记忆").setDesc("对话结束后自动提取关键信息存为记忆")
      .addToggle((toggle) => toggle.setValue(s.memoryEnabled).onChange(async (value) => { s.memoryEnabled = value; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName("记忆文件夹").setDesc("记忆文件存储路径（vault 内）")
      .addText((text) => text.setPlaceholder("记忆").setValue(s.memoryFolder)
        .onChange(async (value) => { s.memoryFolder = value || "记忆"; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName("最大记忆容量 (MB)").setDesc("超过限制后自动按 LRU 清理最旧记忆")
      .addText((text) => { text.inputEl.type = "number"; text.setPlaceholder("100").setValue(String(s.memoryMaxSizeMB))
        .onChange(async (value) => { const n = parseInt(value, 10); s.memoryMaxSizeMB = isNaN(n) || n < 10 ? 100 : Math.min(n, 500); await this.plugin.saveSettings(); }); return text; });
  }
}