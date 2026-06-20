// ============================================================
// 拆分预览 Modal
// ============================================================
import { Modal, App, Setting } from "obsidian";
import type { SplitNote } from "../types";

export interface PreviewModalResult {
  confirmed: boolean;
  notes: SplitNote[];
  targetFolder: string;
}

/**
 * 拆分预览弹窗：
 * - 展示 AI 拆分后的笔记列表
 * - 允许编辑标题、标签
 * - 允许选择目标目录
 * - 「全部确认」「取消」操作
 */
export class SplitPreviewModal extends Modal {
  private notes: SplitNote[];
  private sourceFileName: string;
  private defaultFolder: string;
  private editedNotes: SplitNote[];
  private resolvePromise!: (value: PreviewModalResult) => void;

  private targetFolderInput!: HTMLInputElement;

  constructor(
    app: App,
    notes: SplitNote[],
    sourceFileName: string,
    defaultFolder: string,
  ) {
    super(app);
    this.notes = notes;
    this.sourceFileName = sourceFileName;
    this.defaultFolder = defaultFolder;
    this.editedNotes = notes.map((n) => ({ ...n, tags: [...n.tags] }));
  }

  /** 展示 Modal 并等待用户确认 */
  openAndWait(): Promise<PreviewModalResult> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    // 标题
    contentEl.createEl("h2", {
      text: `拆分预览：${this.sourceFileName}`,
    });

    // 目标目录
    new Setting(contentEl)
      .setName("目标目录")
      .setDesc("拆分后的笔记将存放在此目录")
      .addText((text) => {
        this.targetFolderInput = text.inputEl;
        text.setValue(this.defaultFolder);
      });

    // 拆分笔记列表
    const listContainer = contentEl.createEl("div", {
      cls: "deepseek-preview-list",
    });

    this.notes.forEach((note, index) => {
      const itemEl = listContainer.createEl("div", {
        cls: "deepseek-preview-item",
      });

      // 序号 + 标题编辑
      const headerEl = itemEl.createEl("div", {
        cls: "preview-header",
      });
      headerEl.createEl("strong", { text: `${index + 1}.` });

      const titleInput = headerEl.createEl("input", {
        type: "text",
        value: note.title,
        attr: { style: "flex: 1" },
      });
      titleInput.addEventListener("input", () => {
        this.editedNotes[index].title = titleInput.value;
      });

      // 内容预览
      const contentEl2 = itemEl.createEl("div", {
        cls: "preview-content",
      });
      const preview =
        note.content.length > 200
          ? note.content.slice(0, 200) + "…"
          : note.content;
      contentEl2.setText(preview);

      // 标签编辑
      const tagsEl = itemEl.createEl("div");
      tagsEl.createEl("small", { text: "标签：" });
      note.tags.forEach((tag) => {
        tagsEl.createEl("span", { cls: "preview-tag", text: tag });
      });

      const tagInput = tagsEl.createEl("input", {
        type: "text",
        value: note.tags.join(", "),
        attr: {
          placeholder: "逗号分隔，如：AI, 机器学习, 笔记",
          style: "width: 100%; margin-top: 4px;",
        },
      });
      tagInput.addEventListener("input", () => {
        this.editedNotes[index].tags = tagInput.value
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean);
      });
    });

    // 操作按钮
    const buttonRow = contentEl.createEl("div", {
      attr: { style: "display: flex; gap: 8px; margin-top: 16px;" },
    });

    buttonRow.createEl("button", {
      text: "全部确认",
      cls: "mod-cta",
    }).addEventListener("click", () => {
      this.resolve({
        confirmed: true,
        notes: this.editedNotes,
        targetFolder: this.targetFolderInput.value || this.defaultFolder,
      });
      this.close();
    });

    buttonRow.createEl("button", {
      text: "取消",
    }).addEventListener("click", () => {
      this.resolve({
        confirmed: false,
        notes: [],
        targetFolder: "",
      });
      this.close();
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }

  private resolve(result: PreviewModalResult): void {
    this.resolvePromise(result);
  }
}
