import { App, PluginSettingTab, Setting } from "obsidian";
import type DeepSeekPlugin from "../main";
import type { SanitizerRule } from "./types";

// ============================================================
// 插件设置接口
// ============================================================
export interface DeepSeekSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  sanitizerEnabled: boolean;
  sanitizerRules: SanitizerRule[];
  defaultTargetFolder: string;
}

export const DEFAULT_SETTINGS: DeepSeekSettings = {
  apiKey: "",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-chat",
  sanitizerEnabled: true,
  sanitizerRules: [
    {
      id: "phone",
      name: "手机号",
      regex: "1[3-9]\\d{9}",
      replacement: "[手机号]",
      enabled: true,
    },
    {
      id: "idcard",
      name: "身份证号",
      regex: "\\d{17}[\\dXx]",
      replacement: "[身份证号]",
      enabled: true,
    },
    {
      id: "email",
      name: "邮箱",
      regex: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
      replacement: "[邮箱]",
      enabled: true,
    },
    {
      id: "ip",
      name: "IP 地址",
      regex:
        "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b",
      replacement: "[IP地址]",
      enabled: true,
    },
  ],
  defaultTargetFolder: "知识库",
};

// ============================================================
// Settings Tab 实现
// ============================================================
export class DeepSeekSettingTab extends PluginSettingTab {
  plugin: DeepSeekPlugin;

  constructor(app: App, plugin: DeepSeekPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    // ---- API 配置区域 ----
    containerEl.createEl("h2", { text: "API 配置" });

    new Setting(containerEl)
      .setName("API Base URL")
      .setDesc("DeepSeek API 端点地址。默认 https://api.deepseek.com")
      .addText((text) =>
        text
          .setPlaceholder("https://api.deepseek.com")
          .setValue(s.baseUrl)
          .onChange(async (value) => {
            s.baseUrl = value || "https://api.deepseek.com";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("API Key")
      .setDesc(
        "DeepSeek API Key。也可通过环境变量 DEEPSEEK_API_KEY 设置（优先级更高）。",
      )
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("sk-...")
          .setValue(s.apiKey)
          .onChange(async (value) => {
            s.apiKey = value;
            await this.plugin.saveSettings();
          });
        return text;
      });

    new Setting(containerEl)
      .setName("模型名称")
      .setDesc("默认 deepseek-chat（V4 Pro 等价物）")
      .addText((text) =>
        text
          .setPlaceholder("deepseek-chat")
          .setValue(s.model)
          .onChange(async (value) => {
            s.model = value || "deepseek-chat";
            await this.plugin.saveSettings();
          }),
      );

    // ---- 脱敏配置区域 ----
    containerEl.createEl("h2", { text: "隐私脱敏" });

    new Setting(containerEl)
      .setName("启用脱敏")
      .setDesc("发送内容到 API 前自动过滤敏感信息")
      .addToggle((toggle) =>
        toggle.setValue(s.sanitizerEnabled).onChange(async (value) => {
          s.sanitizerEnabled = value;
          await this.plugin.saveSettings();
          // 刷新面板以显示/隐藏规则列表
          this.display();
        }),
      );

    if (s.sanitizerEnabled) {
      s.sanitizerRules.forEach((rule, index) => {
        new Setting(containerEl)
          .setName(rule.name)
          .setDesc(`替换为：「${rule.replacement}」`)
          .addToggle((toggle) =>
            toggle.setValue(rule.enabled).onChange(async (value) => {
              s.sanitizerRules[index].enabled = value;
              await this.plugin.saveSettings();
            }),
          );
      });
    }

    // ---- 导入配置区域 ----
    containerEl.createEl("h2", { text: "导入配置" });

    new Setting(containerEl)
      .setName("默认目标目录")
      .setDesc("导入并拆分后的笔记默认存放目录")
      .addText((text) =>
        text
          .setPlaceholder("知识库")
          .setValue(s.defaultTargetFolder)
          .onChange(async (value) => {
            s.defaultTargetFolder = value || "知识库";
            await this.plugin.saveSettings();
          }),
      );
  }
}
