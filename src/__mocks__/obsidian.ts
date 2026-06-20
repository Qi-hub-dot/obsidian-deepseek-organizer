// Obsidian API mock for unit tests
export class Plugin {
  app: any;
  manifest: any;
  settings: any;
  addSettingTab() {}
  registerView() {}
  addRibbonIcon() {}
  addCommand() {}
  loadData() { return {}; }
  saveData() {}
  registerEvent() {}
}

export class ItemView {
  containerEl = { children: [null, { empty() {}, createEl() {} }] };
  constructor(leaf: any) {}
  onOpen() {}
  onClose() {}
}

export class MarkdownView {
  file: any;
  editor: any;
}

export class Modal {
  app: any;
  contentEl: any;
  constructor(app: any) { this.app = app; }
  open() {}
  close() {}
  onOpen() {}
  onClose() {}
}

export class Setting {
  constructor(containerEl: any) {}
  setName() { return this; }
  setDesc() { return this; }
  addText(cb: any) { cb({ setPlaceholder() { return this; }, setValue() { return this; }, onChange() { return this; }, inputEl: { type: '' } }); return this; }
  addToggle(cb: any) { cb({ setValue() { return this; }, onChange() { return this; } }); return this; }
}

export class MarkdownRenderer {
  static async render(app: any, text: string, container: any, sourcePath: string, component: any) {
    container.createEl = container.createEl || (() => ({ createEl() {}, createSpan() {}, setText() {} }));
  }
}

export class PluginSettingTab {
  plugin: any;
  constructor(app: any, plugin: any) {
    this.app = app;
    this.plugin = plugin;
  }
}

export class WorkspaceLeaf {}
export class TFile {}
export class TFolder {}
export class Vault {}
export const Notice = class {};
export const Platform = { isDesktop: true, isMobile: false };
export const htmlToMarkdown = (html: string) => html;
