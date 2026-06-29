// ============================================================
// DeepSeek Knowledge Organizer — Plugin Entry
// ============================================================
import { Plugin } from "obsidian";
import { DeepSeekClient } from "./src/api";
import { ChatModelManager } from "./src/LLMProviders/chatModelManager";
import { DeepSeekSettingTab, DEFAULT_SETTINGS } from "./src/settings";
import type { DeepSeekSettings } from "./src/settings";
import { DeepSeekSidebarView } from "./src/sidebar";
import { VIEW_TYPE_DEEPSEEK_CHAT } from "./src/constants";
import { registerCommands } from "./src/commands";
import { Pipeline } from "./src/pipeline";
import { MemoryStore } from "./src/memory";
import { VaultSearchIndex, getSearchIndex } from "./src/search/vaultSearch";
import { registerBuiltinTools } from "./src/tools/builtinTools";
import { CustomCommandManager } from "./src/commands/customCommandManager";
import { ChatPersistenceManager } from "./src/core/chatPersistence";
import { registerQuickAsk } from "./src/editor/quickAsk";

export default class DeepSeekPlugin extends Plugin {
  settings: DeepSeekSettings = { ...DEFAULT_SETTINGS };
  apiClient!: DeepSeekClient;
  modelManager!: ChatModelManager;
  pipeline!: Pipeline;
  memory!: MemoryStore;
  searchIndex!: VaultSearchIndex;
  customCommands!: CustomCommandManager;
  chatPersistence!: ChatPersistenceManager;

  async onload(): Promise<void> {
    await this.loadSettings();

    const effectiveKey = this.getEffectiveApiKey();
    this.apiClient = new DeepSeekClient(
      this.settings.baseUrl,
      effectiveKey,
      this.settings.model,
      this.settings.reasoningEffort,
    );

    // Initialize multi-provider model manager
    this.modelManager = new ChatModelManager(
      this.settings.baseUrl,
      effectiveKey,
      this.settings.model,
      this.settings.reasoningEffort,
    );
    this.syncProviders();

    // Initialize search index (deferred to layout ready)
    this.searchIndex = getSearchIndex(this.app.vault);

    this.pipeline = new Pipeline(this);
    // 延迟初始化 memory，避免 vault 未就绪时报错
    try {
      this.memory = new MemoryStore(this.app, this.settings.memoryFolder, this.settings.memoryMaxSizeMB);
      await this.memory.initialize();
    } catch (e) { console.warn("[DeepSeek] Memory init failed (vault not ready):", e); }
    this.addSettingTab(new DeepSeekSettingTab(this.app, this));
    this.registerView(VIEW_TYPE_DEEPSEEK_CHAT, (leaf) => new DeepSeekSidebarView(leaf, this));
    this.addRibbonIcon("message-square", "DeepSeek 助手", async () => { await this.activateChatSidebar(); });
    this.addCommand({ id: "open-deepseek-chat", name: "打开 DeepSeek 助手", callback: async () => { await this.activateChatSidebar(); } });
    registerCommands(this);

    // Initialize tools
    registerBuiltinTools(this);

    // Initialize custom commands & chat persistence
    this.customCommands = new CustomCommandManager(this.app.vault);
    this.chatPersistence = new ChatPersistenceManager(this.app);

    // Register Quick Ask commands
    registerQuickAsk(this);

    // Defer heavy init to after layout ready
    this.app.workspace.onLayoutReady(() => {
      this.searchIndex.initialize().catch((e) =>
        console.warn("[DeepSeek] Search index init failed:", e),
      );
      this.customCommands.initialize().catch((e) =>
        console.warn("[DeepSeek] Custom commands init failed:", e),
      );
    });
  }

  /** Sync provider configs from settings to model manager */
  syncProviders(): void {
    const s = this.settings;
    // 通义千问
    if (s.qwenApiKey) {
      this.modelManager.registerProvider({
        provider: "qwen",
        apiKey: s.qwenApiKey,
        baseUrl: s.qwenBaseUrl,
        model: s.qwenModel,
      });
    }
    // 智谱 GLM
    if (s.glmApiKey) {
      this.modelManager.registerProvider({
        provider: "glm",
        apiKey: s.glmApiKey,
        baseUrl: s.glmBaseUrl,
        model: s.glmModel,
      });
    }
    // Ollama 本地
    if (s.ollamaBaseUrl) {
      this.modelManager.registerProvider({
        provider: "ollama",
        apiKey: "ollama",
        baseUrl: s.ollamaBaseUrl,
        model: s.ollamaModel,
      });
    }
    // 多模态视觉
    if (s.visionProvider && s.visionProvider !== "none" && s.visionApiKey) {
      this.modelManager.registerVision({
        provider: s.visionProvider as "qwen-vl" | "glm-v",
        apiKey: s.visionApiKey,
        baseUrl: s.visionBaseUrl,
        model: s.visionModel,
      });
    }
  }

  async activateChatSidebar(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_DEEPSEEK_CHAT);
    if (existing.length > 0) { workspace.revealLeaf(existing[0]); return; }
    const leaf = workspace.getRightLeaf(false);
    if (leaf) { await leaf.setViewState({ type: VIEW_TYPE_DEEPSEEK_CHAT, active: true }); workspace.revealLeaf(leaf); }
  }

  getSidebarView(): DeepSeekSidebarView | null {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DEEPSEEK_CHAT);
    return leaves.length === 0 ? null : leaves[0].view as DeepSeekSidebarView;
  }

  getEffectiveApiKey(): string {
    const envKey = (process as any)?.env?.DEEPSEEK_API_KEY;
    return (envKey && envKey.trim()) ? envKey.trim() : this.settings.apiKey;
  }

  async loadSettings(): Promise<void> {
    const stored = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...(stored || {}) };
    const effectiveKey = this.getEffectiveApiKey();
    if (this.apiClient) {
      this.apiClient.updateConfig(this.settings.baseUrl, effectiveKey, this.settings.model, this.settings.reasoningEffort);
    }
    if (this.modelManager) {
      this.modelManager.updateDeepSeekConfig(this.settings.baseUrl, effectiveKey, this.settings.model, this.settings.reasoningEffort);
      this.syncProviders();
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    const effectiveKey = this.getEffectiveApiKey();
    if (this.apiClient) {
      this.apiClient.updateConfig(this.settings.baseUrl, effectiveKey, this.settings.model, this.settings.reasoningEffort);
    }
    if (this.modelManager) {
      this.modelManager.updateDeepSeekConfig(this.settings.baseUrl, effectiveKey, this.settings.model, this.settings.reasoningEffort);
      this.syncProviders();
    }
  }

  onunload(): void {
    console.log("[DeepSeek Organizer] 插件已卸载");
  }
}
