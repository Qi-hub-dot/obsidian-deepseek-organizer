// ============================================================
// 标签/链接建议列表 UI 组件
// ============================================================
import type { TagSuggestion, LinkSuggestion } from "../types";

/**
 * 渲染标签建议列表。
 * @returns 用户选中的标签列表
 */
export function renderTagSuggestions(
  container: HTMLElement,
  suggestions: TagSuggestion[],
): Promise<string[]> {
  return new Promise((resolve) => {
    container.empty();

    const listEl = container.createEl("ul", {
      cls: "deepseek-suggestion-list",
    });

    const checkboxes: Array<{ tag: string; input: HTMLInputElement }> = [];

    suggestions.forEach((s, i) => {
      const item = listEl.createEl("li", {
        cls: "deepseek-suggestion-item",
      });

      const checkbox = item.createEl("input", {
        type: "checkbox",
        attr: { checked: s.confidence >= 0.6 ? "true" : null },
      });
      checkbox.style.marginRight = "8px";

      checkboxes.push({ tag: s.tag, input: checkbox });

      const labelEl = item.createEl("div");

      labelEl.createEl("strong", { text: `#${s.tag}` });
      labelEl.createEl("br");

      if (s.reason) {
        labelEl.createEl("small", {
          text: s.reason,
          attr: { style: "color: var(--text-muted);" },
        });
      }

      // 置信度条
      const barContainer = labelEl.createEl("span", {
        cls: "confidence-bar",
        attr: { style: "display: inline-block; margin-left: 8px;" },
      });
      barContainer.createEl("span", {
        cls: "confidence-fill",
        attr: {
          style: `width: ${Math.round(s.confidence * 100)}%`,
        },
      });
    });

    // 按钮行
    const btnRow = container.createEl("div", {
      attr: { style: "margin-top: 12px; display: flex; gap: 8px;" },
    });

    btnRow.createEl("button", {
      text: "应用选中标签",
      cls: "mod-cta",
    }).addEventListener("click", () => {
      const selected = checkboxes
        .filter((c) => c.input.checked)
        .map((c) => c.tag);
      resolve(selected);
    });

    btnRow.createEl("button", {
      text: "取消",
    }).addEventListener("click", () => {
      resolve([]);
    });
  });
}

/**
 * 渲染链接建议列表。
 * @returns 用户选中的目标笔记列表
 */
export function renderLinkSuggestions(
  container: HTMLElement,
  suggestions: LinkSuggestion[],
): Promise<LinkSuggestion[]> {
  return new Promise((resolve) => {
    container.empty();

    const listEl = container.createEl("ul", {
      cls: "deepseek-suggestion-list",
    });

    const checkboxes: Array<{
      suggestion: LinkSuggestion;
      input: HTMLInputElement;
    }> = [];

    suggestions.forEach((s) => {
      const item = listEl.createEl("li", {
        cls: "deepseek-suggestion-item",
      });

      const checkbox = item.createEl("input", {
        type: "checkbox",
        attr: { checked: "true" },
      });
      checkbox.style.marginRight = "8px";

      checkboxes.push({ suggestion: s, input: checkbox });

      const labelEl = item.createEl("div");

      labelEl.createEl("strong", {
        text: `[[${s.targetNote}]]`,
      });

      if (s.snippet) {
        labelEl.createEl("br");
        labelEl.createEl("small", {
          text: s.snippet.slice(0, 100),
          attr: { style: "color: var(--text-muted); font-style: italic;" },
        });
      }

      if (s.reason) {
        labelEl.createEl("br");
        labelEl.createEl("small", {
          text: `关联理由：${s.reason}`,
          attr: { style: "color: var(--text-accent);" },
        });
      }
    });

    const btnRow = container.createEl("div", {
      attr: { style: "margin-top: 12px; display: flex; gap: 8px;" },
    });

    btnRow.createEl("button", {
      text: "插入选中链接",
      cls: "mod-cta",
    }).addEventListener("click", () => {
      const selected = checkboxes
        .filter((c) => c.input.checked)
        .map((c) => c.suggestion);
      resolve(selected);
    });

    btnRow.createEl("button", {
      text: "取消",
    }).addEventListener("click", () => {
      resolve([]);
    });
  });
}
