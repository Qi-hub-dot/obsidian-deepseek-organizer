import { App, PluginSettingTab, Setting } from "obsidian";
import type DeepSeekPlugin from "../main";
import type { SanitizerRule, ChatMessage } from "./types";

export interface DeepSeekSettings {
  // ---- DeepSeek (默认) ----
  apiKey: string;
  baseUrl: string;
  model: string;
  reasoningEffort: string;
  // ---- 多提供商配置 ----
  activeProvider: string; // "deepseek" | "qwen" | "glm" | "ollama"
  // 通义千问
  qwenApiKey: string;
  qwenBaseUrl: string;
  qwenModel: string;
  // 智谱 GLM
  glmApiKey: string;
  glmBaseUrl: string;
  glmModel: string;
  // Ollama 本地
  ollamaBaseUrl: string;
  ollamaModel: string;
  // ---- 多模态（图像识别）----
  visionProvider: string; // "qwen-vl" | "glm-v" | "none"
  visionApiKey: string;
  visionBaseUrl: string;
  visionModel: string;
  // ---- System Prompt ----
  systemPrompt: string;
  // ---- General ----
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
  activeProvider: "deepseek",
  qwenApiKey: "",
  qwenBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  qwenModel: "qwen-plus",
  glmApiKey: "",
  glmBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
  glmModel: "glm-4-flash",
  ollamaBaseUrl: "http://localhost:11434",
  ollamaModel: "qwen2.5:7b",
  visionProvider: "none",
  visionApiKey: "",
  visionBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  visionModel: "qwen-vl-plus",
  systemPrompt: "",
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

    // ========== DeepSeek 配置 ==========
    containerEl.createEl("h2", { text: "🔴 DeepSeek — 默认" });

    new Setting(containerEl)
      .setName("API Base URL")
      .setDesc("DeepSeek API 端点。默认 https://api.deepseek.com")
      .addText((text) => text.setPlaceholder("https://api.deepseek.com").setValue(s.baseUrl)
        .onChange(async (value) => { s.baseUrl = value || "https://api.deepseek.com"; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName("API Key")
      .setDesc("DeepSeek API Key。也可通过环境变量 DEEPSEEK_API_KEY 设置。")
      .addText((text) => { text.inputEl.type = "password"; text.setPlaceholder("sk-...").setValue(s.apiKey)
        .onChange(async (value) => { s.apiKey = value; await this.plugin.saveSettings(); }); return text; });

    new Setting(containerEl)
      .setName("模型选择")
      .setDesc("⚡ V4 Flash = 快速 | 🧠 V4 Pro = 深度推理")
      .addDropdown((dropdown) => {
        dropdown.addOption("deepseek-chat", "⚡ V4 Flash (deepseek-chat)");
        dropdown.addOption("deepseek-reasoner", "🧠 V4 Pro (deepseek-reasoner)");
        dropdown.addOption("__custom__", "🔧 自定义...");
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
        .setName("自定义模型名").setDesc("输入完整模型 ID")
        .addText((text) => text.setPlaceholder("deepseek-chat").setValue(s.model)
          .onChange(async (value) => { s.model = value || "deepseek-chat"; await this.plugin.saveSettings(); }));
    }

    if (s.model === "deepseek-reasoner") {
      new Setting(containerEl)
        .setName("推理强度").setDesc("high = 更深推理（慢），low = 快速")
        .addDropdown((dropdown) => {
          dropdown.addOption("low", "Low — 快速");
          dropdown.addOption("medium", "Medium — 均衡 (推荐)");
          dropdown.addOption("high", "High — 深度");
          dropdown.setValue(s.reasoningEffort || "medium");
          dropdown.onChange(async (value) => { s.reasoningEffort = value; await this.plugin.saveSettings(); });
        });
    }

    // ========== 通义千问 ==========
    containerEl.createEl("h2", { text: "🟠 通义千问 (阿里云)" });
    containerEl.createEl("p", { text: "API Key 获取：阿里云百炼 → 模型服务 → API-KEY 管理", attr: { style: "color: var(--text-muted); font-size: 0.8em;" } });
    new Setting(containerEl)
      .setName("API Key").setDesc("sk-...")
      .addText((text) => { text.inputEl.type = "password"; text.setPlaceholder("sk-...").setValue(s.qwenApiKey)
        .onChange(async (v) => { s.qwenApiKey = v; await this.plugin.saveSettings(); }); return text; });
    new Setting(containerEl)
      .setName("Base URL")
      .addText((text) => text.setPlaceholder("https://dashscope.aliyuncs.com/compatible-mode/v1").setValue(s.qwenBaseUrl)
        .onChange(async (v) => { s.qwenBaseUrl = v || "https://dashscope.aliyuncs.com/compatible-mode/v1"; await this.plugin.saveSettings(); }));
    new Setting(containerEl)
      .setName("Model").setDesc("qwen-plus / qwen-max / qwen-turbo / qwen-long")
      .addText((text) => text.setPlaceholder("qwen-plus").setValue(s.qwenModel)
        .onChange(async (v) => { s.qwenModel = v || "qwen-plus"; await this.plugin.saveSettings(); }));

    // ========== 智谱 GLM ==========
    containerEl.createEl("h2", { text: "🔵 智谱 GLM" });
    containerEl.createEl("p", { text: "API Key 获取：智谱AI开放平台 → API Keys", attr: { style: "color: var(--text-muted); font-size: 0.8em;" } });
    new Setting(containerEl)
      .setName("API Key")
      .addText((text) => { text.inputEl.type = "password"; text.setPlaceholder("...").setValue(s.glmApiKey)
        .onChange(async (v) => { s.glmApiKey = v; await this.plugin.saveSettings(); }); return text; });
    new Setting(containerEl)
      .setName("Base URL")
      .addText((text) => text.setPlaceholder("https://open.bigmodel.cn/api/paas/v4").setValue(s.glmBaseUrl)
        .onChange(async (v) => { s.glmBaseUrl = v || "https://open.bigmodel.cn/api/paas/v4"; await this.plugin.saveSettings(); }));
    new Setting(containerEl)
      .setName("Model").setDesc("glm-4-flash / glm-4 / glm-4-plus")
      .addText((text) => text.setPlaceholder("glm-4-flash").setValue(s.glmModel)
        .onChange(async (v) => { s.glmModel = v || "glm-4-flash"; await this.plugin.saveSettings(); }));

    // ========== Ollama 本地 ==========
    containerEl.createEl("h2", { text: "🦙 Ollama (本地)" });
    new Setting(containerEl)
      .setName("Base URL").setDesc("本地 Ollama 服务地址")
      .addText((text) => text.setPlaceholder("http://localhost:11434").setValue(s.ollamaBaseUrl)
        .onChange(async (v) => { s.ollamaBaseUrl = v || "http://localhost:11434"; await this.plugin.saveSettings(); }));
    new Setting(containerEl)
      .setName("Model").setDesc("本地模型名，如 qwen2.5:7b")
      .addText((text) => text.setPlaceholder("qwen2.5:7b").setValue(s.ollamaModel)
        .onChange(async (v) => { s.ollamaModel = v || "qwen2.5:7b"; await this.plugin.saveSettings(); }));

    // ========== 多模态视觉识别 ==========
    containerEl.createEl("h2", { text: "📷 多模态 — 图像识别" });
    containerEl.createEl("p", { text: "DeepSeek 暂不支持多模态。在此配置支持图像识别的大模型，用于分析图片、截图、手写笔记等。", attr: { style: "color: var(--text-muted); font-size: 0.8em; margin-bottom: 8px;" } });

    new Setting(containerEl)
      .setName("视觉提供商")
      .setDesc("选择用于图像识别的国产大模型")
      .addDropdown((dropdown) => {
        dropdown.addOption("none", "— 未启用 —");
        dropdown.addOption("qwen-vl", "🟠 通义千问 VL");
        dropdown.addOption("glm-v", "🔵 智谱 GLM-4V");
        dropdown.setValue(s.visionProvider || "none");
        dropdown.onChange(async (v) => { s.visionProvider = v; await this.plugin.saveSettings(); this.display(); });
      });

    if (s.visionProvider && s.visionProvider !== "none") {
      new Setting(containerEl)
        .setName("API Key")
        .setDesc(s.visionProvider === "qwen-vl" ? "阿里云百炼 API Key（可与通义千问共用）" : "智谱AI API Key（可与 GLM 共用）")
        .addText((text) => { text.inputEl.type = "password"; text.setPlaceholder("...").setValue(s.visionApiKey)
          .onChange(async (v) => { s.visionApiKey = v; await this.plugin.saveSettings(); }); return text; });
      new Setting(containerEl)
        .setName("Base URL")
        .addText((text) => text.setValue(s.visionBaseUrl)
          .onChange(async (v) => { s.visionBaseUrl = v; await this.plugin.saveSettings(); }));
      new Setting(containerEl)
        .setName("Vision Model")
        .setDesc(s.visionProvider === "qwen-vl" ? "qwen-vl-plus / qwen-vl-max" : "glm-4v / glm-4v-plus")
        .addText((text) => text.setValue(s.visionModel)
          .onChange(async (v) => { s.visionModel = v; await this.plugin.saveSettings(); }));
    }

    // ========== System Prompt ==========
    containerEl.createEl("h2", { text: "💬 系统提示词" });
    containerEl.createEl("p", { text: "自定义 AI 的行为指令。留空使用默认。支持 {{note}} {{tags}} 等变量。", attr: { style: "color: var(--text-muted); font-size: 0.8em; margin-bottom: 8px;" } });
    const spContainer = containerEl.createEl("div");
    const spTextarea = spContainer.createEl("textarea", {
      attr: {
        placeholder: "（留空使用默认系统提示词）\n\n可用变量：{{note}} 当前笔记内容  {{tags}} vault 标签\n自定义指令示例：\n你是一个学术论文写作助手，请用严谨的语言回答。",
        style: "width:100%; min-height:120px; font-size:12px; font-family:var(--font-monospace); padding:8px; border-radius:6px; border:1px solid var(--background-modifier-border); background:var(--background-primary); color:var(--text-normal); resize:vertical;",
      },
    });
    spTextarea.value = s.systemPrompt || "";
    spTextarea.addEventListener("input", async () => {
      s.systemPrompt = spTextarea.value;
      await this.plugin.saveSettings();
    });

    // ========== 通用设置 ==========
    containerEl.createEl("h2", { text: "🔒 隐私脱敏" });
    new Setting(containerEl)
      .setName("启用脱敏").setDesc("发送到 API 前自动过滤敏感信息")
      .addToggle((toggle) => toggle.setValue(s.sanitizerEnabled).onChange(async (value) => { s.sanitizerEnabled = value; await this.plugin.saveSettings(); this.display(); }));

    if (s.sanitizerEnabled) {
      s.sanitizerRules.forEach((rule, index) => {
        new Setting(containerEl)
          .setName(rule.name).setDesc(`替换为：「${rule.replacement}」`)
          .addToggle((toggle) => toggle.setValue(rule.enabled).onChange(async (value) => { s.sanitizerRules[index].enabled = value; await this.plugin.saveSettings(); }));
      });
    }

    containerEl.createEl("h2", { text: "📂 导入配置" });
    new Setting(containerEl)
      .setName("默认目标目录").setDesc("导入拆分后的笔记存放目录")
      .addText((text) => text.setPlaceholder("知识库").setValue(s.defaultTargetFolder)
        .onChange(async (value) => { s.defaultTargetFolder = value || "知识库"; await this.plugin.saveSettings(); }));

    containerEl.createEl("h2", { text: "🧠 记忆缓存" });
    containerEl.createEl("p", { text: "AI 自动记住对话关键信息，下次对话检索相关记忆。", attr: { style: "color: var(--text-muted); font-size: 0.85em;" } });
    new Setting(containerEl)
      .setName("启用记忆").setDesc("对话后自动提取关键信息存为记忆")
      .addToggle((toggle) => toggle.setValue(s.memoryEnabled).onChange(async (value) => { s.memoryEnabled = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl)
      .setName("记忆文件夹")
      .addText((text) => text.setPlaceholder("记忆").setValue(s.memoryFolder)
        .onChange(async (value) => { s.memoryFolder = value || "记忆"; await this.plugin.saveSettings(); }));
    new Setting(containerEl)
      .setName("最大容量 (MB)")
      .addText((text) => { text.inputEl.type = "number"; text.setPlaceholder("100").setValue(String(s.memoryMaxSizeMB))
        .onChange(async (value) => { const n = parseInt(value, 10); s.memoryMaxSizeMB = isNaN(n) || n < 10 ? 100 : Math.min(n, 500); await this.plugin.saveSettings(); }); return text; });
  }
}
