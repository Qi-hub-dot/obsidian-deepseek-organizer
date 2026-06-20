// ============================================================
// DeepSeek Knowledge Organizer — Plugin Entry
// ============================================================
import { Plugin } from "obsidian";
import { DeepSeekClient } from "./src/api";
import { DeepSeekSettingTab, DEFAULT_SETTINGS } from "./src/settings";
import type { DeepSeekSettings } from "./src/settings";
import { DeepSeekSidebarView, VIEW_TYPE_DEEPSEEK_CHAT } from "./src/sidebar";
import { registerCommands } from "./src/commands";

export default class DeepSeekPlugin extends Plugin {
  settings: DeepSeekSettings = { ...DEFAULT_SETTINGS };
  apiClient!: DeepSeekClient;

  async onload(): Promise<void> {
    // 1. 加载设置，环境变量优先
    await this.loadSettings();

    // 2. 初始化 API 客户端
    this.apiClient = new DeepSeekClient(
      this.settings.baseUrl,
      this.settings.apiKey,
      this.settings.model,
    );

    // 3. 注册 Settings Tab
    this.addSettingTab(new DeepSeekSettingTab(this.app, this));

    // 4. 注册侧边栏视图
    this.registerView(
      VIEW_TYPE_DEEPSEEK_CHAT,
      (leaf) => new DeepSeekSidebarView(leaf, this),
    );

    // 5. 添加 Ribbon 图标
    this.addRibbonIcon("message-square", "DeepSeek 助手", async () => {
      await this.activateChatSidebar();
    });

    // 6. 注册命令
    this.addCommand({
      id: "open-deepseek-chat",
      name: "打开 DeepSeek 助手",
      callback: async () => {
        await this.activateChatSidebar();
      },
    });

    // 7. 注册命令面板命令
    registerCommands(this);
  }

  /** 激活或切换聊天侧边栏 */
  async activateChatSidebar(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_DEEPSEEK_CHAT);
    if (existing.length > 0) {
      workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({
        type: VIEW_TYPE_DEEPSEEK_CHAT,
        active: true,
      });
      workspace.revealLeaf(leaf);
    }
  }

  /** 获取侧边栏视图实例 */
  getSidebarView(): DeepSeekSidebarView | null {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DEEPSEEK_CHAT);
    if (leaves.length === 0) return null;
    return leaves[0].view as DeepSeekSidebarView;
  }

  /** 获取最终生效的 API Key（环境变量优先） */
  getEffectiveApiKey(): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const envKey = (process as any)?.env?.DEEPSEEK_API_KEY;
    if (envKey && envKey.trim()) {
      return envKey.trim();
    }
    return this.settings.apiKey;
  }

  /** 重新加载设置并同步 API 客户端 */
  async loadSettings(): Promise<void> {
    const stored = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...(stored || {}) };

    // 环境变量优先
    const effectiveKey = this.getEffectiveApiKey();
    if (effectiveKey && effectiveKey !== this.settings.apiKey) {
      // 环境变量覆盖了存储值，更新运行时 apiKey
    }

    if (this.apiClient) {
      this.apiClient.updateConfig(
        this.settings.baseUrl,
        effectiveKey,
        this.settings.model,
      );
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    // 同步 API 客户端
    const effectiveKey = this.getEffectiveApiKey();
    if (this.apiClient) {
      this.apiClient.updateConfig(
        this.settings.baseUrl,
        effectiveKey,
        this.settings.model,
      );
    }
  }

  onunload(): void {
    // 清理由 Obsidian 框架自动处理
    console.log("[DeepSeek Organizer] 插件已卸载");
  }
}
