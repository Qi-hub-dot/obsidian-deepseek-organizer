// ============================================================
// Canvas 创建前预览 Modal
// ============================================================
import { Modal, App } from "obsidian";

/**
 * 轻量确认弹窗：展示 Canvas 概要信息，用户确认后创建。
 */
export class CanvasPreviewModal extends Modal {
  private nodeCount: number;
  private edgeCount: number;
  private title: string;
  private onResolve: (confirmed: boolean) => void;

  constructor(
    app: App,
    nodeCount: number,
    edgeCount: number,
    title: string,
    onResolve: (confirmed: boolean) => void,
  ) {
    super(app);
    this.nodeCount = nodeCount;
    this.edgeCount = edgeCount;
    this.title = title;
    this.onResolve = onResolve;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "Canvas 知识网络预览" });

    // 概要信息
    const info = contentEl.createEl("div", {
      attr: { style: "margin: 16px 0; line-height: 1.8;" },
    });
    info.createEl("p", { text: `📌 根节点：${this.title}` });
    info.createEl("p", {
      text: `🔷 节点数：${this.nodeCount}　🔗 连线数：${this.edgeCount}`,
    });
    info.createEl("p", {
      text: "确认后将创建 .canvas 文件并自动打开。",
      attr: { style: "color: var(--text-muted); font-size: 0.9em;" },
    });

    // 按钮行
    const btnRow = contentEl.createEl("div", {
      attr: { style: "display: flex; gap: 8px; margin-top: 16px;" },
    });
    btnRow
      .createEl("button", { text: "确认创建", cls: "mod-cta" })
      .addEventListener("click", () => {
        this.onResolve(true);
        this.close();
      });
    btnRow
      .createEl("button", { text: "取消" })
      .addEventListener("click", () => {
        this.onResolve(false);
        this.close();
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
