import { MarkdownRenderer, Notice } from "obsidian";
import type DeepSeekPlugin from "../../main";
import { DeepSeekError } from "../types";
import type { ChatMessage } from "../types";

export interface ChatViewCallbacks {
  onSend: (m: string) => Promise<void>;
  onAttachFile: (f: File) => Promise<void>;
  onRetry: () => Promise<void>;
  onCreateCanvas: (c: string) => Promise<void>;
  onSetModel: (md: "chat"|"reasoner") => void;
  onOpenNote: (path: string) => Promise<void>;
  onNewConversation: () => void;
  onSwitchConversation: (id: string) => void;
}

export class ChatView {
  private c: HTMLElement;
  private msgs: HTMLElement;
  private inp: HTMLElement;
  private ctx: HTMLElement;
  private p: DeepSeekPlugin;
  private m: ChatMessage[] = [];
  private st = false;
  private ce: HTMLElement | null = null;
  private cw: HTMLElement | null = null;
  private af: File | null = null;
  private ab: HTMLElement | null = null;
  private lm: string | null = null;
  private mtb: HTMLButtonElement | null = null;
  private segBuf = "";
  private segLastRender = 0;
  private segContainer: HTMLElement | null = null;
  private livePreview: HTMLElement | null = null;
  private thinkPanel: HTMLDetailsElement | null = null;
  private sraf = 0;
  private _flushLock = false;
  private stopCallback: (() => void) | null = null;
  private stopBtn: HTMLButtonElement | null = null;
  private _curModel: "chat"|"reasoner" = "chat";

  callbacks: ChatViewCallbacks = {
    onSend: async () => {}, onAttachFile: async () => {},
    onRetry: async () => {},
    onCreateCanvas: async () => {}, onSetModel: () => {},
    onOpenNote: async () => {},
    onNewConversation: () => {}, onSwitchConversation: () => {},
  };

  constructor(ct: HTMLElement, pl: DeepSeekPlugin) { this.c = ct; this.p = pl; this.bd(); }

  private bd(): void {
    this.c.empty(); this.c.addClass("deepseek-chat-container");
    this.ctx = this.c.createEl("div", { cls: "deepseek-context-bar" });
    this._ulbl("No note");
    this.msgs = this.c.createEl("div", { cls: "deepseek-chat-messages" });
    this.c.createEl("div", { cls: "deepseek-error-bar", attr: { style: "display: none" } });
    this.ab = this.c.createEl("div", { cls: "deepseek-attachment-badge", attr: { style: "display: none" } });
    this.inp = this.c.createEl("div", { cls: "deepseek-chat-input-area" });

    this.mtb = this.inp.createEl("button", { cls: "deepseek-toggle-btn", attr: { title: "Model" } });
    this.mtb.createSpan({ text: "🚀" });
    this.mtb.addEventListener("click", () => { this._mpop(); });

    const abtn = this.inp.createEl("button", { cls: "deepseek-attach-btn", attr: { title: "Attach" } });
    abtn.createSpan({ text: "📎" });
    const fi = this.inp.createEl("input", { type: "file", attr: { accept: ".md,.txt,.pdf,.docx", style: "display: none" } });
    abtn.addEventListener("click", () => { fi.click(); });
    fi.addEventListener("change", async () => { const f = fi.files?.[0]; if (f) { await this._haf(f); } fi.value = ""; });

    const ta = this.inp.createEl("textarea", { cls: "deepseek-chat-input", attr: { placeholder: "Type... (Enter send)", rows: "1" } });
    const sb = this.inp.createEl("button", { cls: "deepseek-chat-send-btn", text: "Send" });
    ta.addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this._hs(ta); } });
    sb.addEventListener("click", () => { this._hs(ta); });
    ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; });
  }

  _ulbl(l: string): void {
    this.ctx.empty(); this.ctx.createSpan({ cls: "context-icon", text: "📄" });
    this.ctx.createSpan({ text: "Context: " + l });
    const nc = this.ctx.createEl("button", { cls: "deepseek-new-chat-btn", attr: { title: "新建会话" } });
    nc.createSpan({ text: "➕" });
    nc.addEventListener("click", () => { this.callbacks.onNewConversation(); });
    const rb = this.ctx.createEl("button", { cls: "deepseek-refresh-btn", attr: { title: "Refresh" } });
    rb.createSpan({ text: "🔄" });
    rb.addEventListener("click", () => { this._rst(); new Notice("Refreshed"); });
  }

  // 显示已保存的对话历史列表（在上下文栏下方）
  showHistoryList(convs: Array<{ id: string; title: string }>): void {
    const old = this.c.querySelector(".deepseek-history-list");
    if (old) old.remove();
    if (convs.length === 0) return;
    const list = this.c.createEl("div", { cls: "deepseek-history-list" });
    this.ctx.after(list);
    list.createSpan({ text: "历史: ", cls: "history-label" });
    convs.forEach(c => {
      const it = list.createEl("button", { cls: "deepseek-history-item", text: c.title.slice(0, 30) });
      it.addEventListener("click", () => { this.callbacks.onSwitchConversation(c.id); });
    });
  }

  private async _hs(ta: HTMLTextAreaElement): Promise<void> {
    const ct = ta.value.trim(); if (!ct || this.st) return;
    ta.value = ""; ta.style.height = "auto"; this._he();
    this.lm = ct; this.am({ role: "user", content: ct }); this.m.push({ role: "user", content: ct });
    this.st = true; this.ce = this._cp();
    try { await this.callbacks.onSend(ct); }
    catch (err) { this._cxl(); const em = err instanceof DeepSeekError ? err.toUserMessage() : err instanceof Error ? err.message : "Error"; this.se(em, true); }
  }

  private async _haf(f: File): Promise<void> {
    this.af = f; this._sab(f.name);
    try { await this.callbacks.onAttachFile(f); }
    catch (err) { this.se(err instanceof Error ? err.message : "Parse error"); }
  }

  _sab(n: string): void {
    if (!this.ab) return;
    this.ab.empty(); this.ab.style.display = "flex";
    this.ab.createSpan({ text: "📄", cls: "attachment-icon" });
    this.ab.createSpan({ text: n, cls: "attachment-name" });
    const rm = this.ab.createEl("button", { cls: "attachment-remove-btn", text: "✕", attr: { title: "Remove" } });
    rm.addEventListener("click", () => { this._cla(); });
  }

  _cla(): void { this.af = null; if (this.ab) { this.ab.style.display = "none"; this.ab.empty(); } }
  _gaf(): File | null { return this.af; }

  am(msg: ChatMessage): HTMLElement {
    const w = this.msgs.createEl("div", { cls: "deepseek-message-wrapper " + msg.role });
    const el = w.createEl("div", { cls: "deepseek-message markdown-preview-view " + msg.role });
    this._rm(el, msg.content);
    if (msg.role === "assistant" && msg.content.trim()) this._aab(w, msg.content);
    this._sc(); return el;
  }

  // 操作按钮：应用到白板 + 复制（笔记已自动保存）
  private _aab(w: HTMLElement, ct: string, _notePath?: string): void {
    const bar = w.createEl("div", { cls: "deepseek-message-actions" });
    const cb = bar.createEl("button", { cls: "deepseek-action-btn", text: "🧠 应用到白板", attr: { title: "创建 Canvas 白板" } });
    cb.addEventListener("click", async () => { try { await this.callbacks.onCreateCanvas(ct); } catch (e) { new Notice(e instanceof Error ? e.message : "Fail"); } });
    const xb = bar.createEl("button", { cls: "deepseek-action-btn", text: "📋 Copy", attr: { title: "复制完整 Markdown" } });
    xb.addEventListener("click", async () => { try { await navigator.clipboard.writeText(ct); new Notice("Copied"); } catch { new Notice("Copy fail"); } });
  }

  _app(d: string, done = false): void {
    if (!this.ce) return;
    const last = this.m[this.m.length - 1];
    if (last && last.role === "assistant") last.content += d;
    this.segBuf += d;
    if (this.livePreview) {
      const unrendered = this.segBuf.slice(this.segLastRender);
      this.livePreview.textContent = unrendered;
    }
    if (!done && this.stopCallback && this._isLooping()) {
      this.stopCallback();
      return;
    }
    if (done) {
      if (this.sraf) { cancelAnimationFrame(this.sraf); this.sraf = 0; }
      this._flush(true);
      return;
    }
    if (!this.sraf) {
      this.sraf = requestAnimationFrame(async () => {
        await this._flush(false);
        this.sraf = 0;
      });
    }
  }

  private _isLooping(): boolean {
    if (this.segBuf.length < 500) return false;
    const lines = this.segBuf.split("\n");
    const recent = lines.slice(-20);
    let streak = 0;
    let lastLine = "";
    for (const line of recent) {
      const t = line.trim();
      // 忽略短行
      if (t.length < 15) { streak = 0; continue; }
      // 数学公式行免疫：包含 LaTeX 命令或 $$ / $ 的行不参与循环检测
      if (t.includes("$") || t.includes("\\frac") || t.includes("\\sum") ||
          t.includes("\\int") || t.includes("\\begin") || t.includes("\\end") ||
          t.startsWith("|") || t.startsWith("\\[") || t.startsWith("\\]")) {
        streak = 0; continue;
      }
      if (t === lastLine) {
        streak++;
        if (streak >= 6) return true; // 从 4 提升到 6，避免误判
      } else {
        lastLine = t;
        streak = 1;
      }
    }
    return false;
  }

  private _paraBreak(text: string): number {
    let inCodeBlock = false; let inMathBlock = false; let last = 0;
    // 按行扫描，跟踪代码块、数学块、表格、引用块状态
    const lines = text.split("\n");
    let inCode = false, inMath = false, inTable = false, inQuote = false;
    let pos = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineStart = pos;
      const line = lines[i];
      pos += line.length + 1; // +1 for \n
      const t = line.trim();

      // 代码块 ```...```
      if (!inMath && (t.startsWith("```") || t.startsWith("~~~"))) {
        inCode = !inCode;
        if (!inCode) { last = pos; inTable = false; inQuote = false; }
        continue;
      }
      // 数学块 $$...$$
      if (!inCode && t.startsWith("$$") && t.length >= 2) {
        inMath = !inMath;
        if (!inMath) { last = pos; inTable = false; inQuote = false; }
        continue;
      }
      if (inCode || inMath) continue;

      // 表格：|...| 行 + |---| 分隔行构成表格块
      const isTableLine = /^\|.+\|$/.test(t);
      const isTableSep  = /^\|[\s\-:]+\|$/.test(t);
      if (isTableSep) { inTable = true; continue; }
      if (inTable && isTableLine) continue;
      if (inTable && t === "") { inTable = false; last = pos; continue; }
      if (isTableLine && i + 1 < lines.length && /^\|[\s\-:]+\|$/.test(lines[i + 1].trim())) {
        inTable = true; continue;
      }

      // 引用块 > ...
      const isQuoteLine = t.startsWith(">");
      if (isQuoteLine) { inQuote = true; continue; }
      if (inQuote && t === "") { inQuote = false; last = pos; continue; }
      if (inQuote && !isQuoteLine) { inQuote = false; }

      // 安全断点：空行后是非特殊内容的行
      if (t === "" && i + 1 < lines.length) {
        const nx = lines[i + 1].trim();
        if (nx !== "" && !nx.startsWith("|") && !nx.startsWith(">")
          && !nx.startsWith("```") && !nx.startsWith("$$")) {
          last = pos;
        }
      }
    }

    // 仍在特殊块内部 → 暂不渲染
    if (inMath || inCode || inTable) return 0;
    if (last === 0 && text.length >= 40) {
      for (let i = text.length - 1; i >= 0; i--) {
        if (text[i] === " " || text[i] === "\n") { last = i + 1; break; }
      }
      if (last === 0) last = text.length;
    }
    return last;
  }

  private async _flush(final: boolean): Promise<void> {
    if (!this.ce || !this.segContainer || this._flushLock) return;
    this._flushLock = true;
    try {
    const newPart = this.segBuf.slice(this.segLastRender);
    if (newPart) {
      let renderText = "";
      if (final) { renderText = newPart; }
      else { const b = this._paraBreak(newPart); if (b > 0) renderText = newPart.slice(0, b); }
      if (renderText) {
        const seg = document.createElement("div");
        seg.className = "deepseek-segment";
        this.segContainer.appendChild(seg);
        await MarkdownRenderer.render(this.p.app, renderText, seg, "", this.p);
        this.segLastRender += renderText.length;
        if (this.livePreview) {
          const remaining = this.segBuf.slice(this.segLastRender);
          this.livePreview.textContent = remaining;
        }
      }
    }
    if (final) {
      // 只隐藏思考面板，不显示操作按钮（由 finalizeWithNote 统一处理）
      if (this.thinkPanel) this.thinkPanel.style.display = "none";
      this.st = false; this.ce = null;
      // 保留 cw 以便 finalizeWithNote 使用
    }
    this._sc();
    } finally {
      this._flushLock = false;
    }
  }

  async _fin(): Promise<void> {
    if (this.ce) { await this._flush(true); }
    this.st = false; this.ce = null;
    // 不释放 cw，等待 sidebar 调用 finalizeWithNote
  }

  // 从完整 Markdown 中提取框架摘要（标题 + 首段要点）
  private _extractFramework(content: string, notePath: string): string {
    const lines = content.split("\n");
    const out: string[] = [];
    out.push("> 📝 完整内容已自动保存为笔记\n");
    let inCode = false, inMath = false, inTable = false;
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (!t) { inTable = false; continue; }
      if (t.startsWith("```")) { inCode = !inCode; continue; }
      if (t.startsWith("$$") && t.length >= 2) { inMath = !inMath; continue; }
      if (inCode || inMath) continue;
      // 表格行：只提取表头
      if (/^\|.+\|$/.test(t)) {
        if (!inTable && i + 1 < lines.length && /^\|[\s\-:]+\|$/.test(lines[i + 1].trim())) {
          inTable = true;
          out.push("📊 **" + t.replace(/\|/g, " | ").replace(/\s+/g, " ").trim().slice(0, 80) + "**");
          i++; // skip separator
        }
        continue;
      }
      if (inTable && t === "") { inTable = false; continue; }
      // 标题
      if (/^#{1,4}\s/.test(t)) {
        out.push(t);
        continue;
      }
      // 段落首句
      if (!/^[#>|\-\*`]/.test(t) && t.length > 10 && out.length < 25) {
        const first = t.split(/[。.！!？?\n]/)[0].slice(0, 100);
        if (first.length > 10) out.push("- " + first);
      }
    }
    return out.join("\n") || "> 内容已保存为笔记";
  }

  // 进度条
  private _progressBar: HTMLElement | null = null;

  showProgress(msg: string): void {
    if (this._progressBar) this._progressBar.remove();
    const bar = this.c.createEl("div", { cls: "deepseek-progress-bar" });
    bar.createSpan({ text: msg, cls: "progress-text" });
    const track = bar.createEl("div", { cls: "progress-track" });
    track.createEl("div", { cls: "progress-fill" });
    this.c.insertBefore(bar, this.msgs);
    this._progressBar = bar;
  }

  hideProgress(): void {
    if (this._progressBar) { this._progressBar.remove(); this._progressBar = null; }
  }

  // 普通对话完成：保留全部内容 + 显示操作按钮
  async finalizeWithActions(): Promise<void> {
    const fullContent = this.segBuf;
    if (this.thinkPanel) this.thinkPanel.style.display = "none";
    if (this.cw && fullContent.trim()) this._aab(this.cw, fullContent);
    this.st = false; this.ce = null; this.cw = null;
  }

  // 生成笔记时调用：用框架替换内容（对话框仅显示框架摘要）
  async finalizeWithNote(notePath: string): Promise<void> {
    const fullContent = this.segBuf;
    if (!this.cw) return;
    const framework = this._extractFramework(fullContent, notePath);
    if (this.segContainer) {
      this.segContainer.empty();
      const fwDiv = this.segContainer.createEl("div", { cls: "deepseek-framework" });
      await MarkdownRenderer.render(this.p.app, framework, fwDiv, "", this.p);
    }
    if (this.thinkPanel) this.thinkPanel.style.display = "none";
    if (this.cw && fullContent.trim()) this._aab(this.cw, fullContent);
    this.st = false; this.ce = null; this.cw = null;
  }

  _cxl(): void {
    if (this.sraf) { cancelAnimationFrame(this.sraf); this.sraf = 0; }
    this._flushLock = false;
    if (this.m.length > 0 && this.m[this.m.length - 1].role === "assistant" && !this.m[this.m.length - 1].content)
      this.m.pop();
    if (this.cw) this.cw.remove();
    this.segBuf = ""; this.segLastRender = 0;
    this.segContainer = null; this.livePreview = null; this.thinkPanel = null;
    this.st = false; this.ce = null; this.cw = null;
  }

  _rst(): void { this._cxl(); this._he(); }

  private _cp(): HTMLElement {
    const w = this.msgs.createEl("div", { cls: "deepseek-message-wrapper assistant" });
    const el = w.createEl("div", { cls: "deepseek-message markdown-preview-view assistant" });
    this.cw = w; this.m.push({ role: "assistant", content: "" });
    this.segBuf = ""; this.segLastRender = 0;
    this.segContainer = el.createEl("div", { cls: "deepseek-segments" });
    this.thinkPanel = el.createEl("details", { cls: "deepseek-think-panel", attr: { open: "true" } });
    const summary = this.thinkPanel.createEl("summary", { cls: "deepseek-think-summary" });
    summary.createSpan({ text: "思考中" });
    summary.createSpan({ cls: "deepseek-thinking-dots" });
    this.stopBtn = summary.createEl("button", { cls: "deepseek-stop-btn", text: "⏹ 停止", attr: { title: "终止生成" } });
    this.stopBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); if (this.stopCallback) this.stopCallback(); });
    this.livePreview = this.thinkPanel.createEl("div", { cls: "deepseek-live-preview" });
    this._sc(); return el;
  }

  private async _rm(el: HTMLElement, t: string): Promise<void> {
    await MarkdownRenderer.render(this.p.app, t, el, "", this.p);
  }

  se(m: string, sr = false): void {
    let ee = this.c.querySelector(".deepseek-error-bar") as HTMLElement | null;
    if (!ee) { ee = this.c.createEl("div", { cls: "deepseek-error-bar" }); this.c.insertBefore(ee, this.inp); }
    ee.empty(); ee.createSpan({ text: "⚠️ " + m });
    if (sr && this.lm) {
      const rb = ee.createEl("button", { cls: "deepseek-retry-btn", text: "🔄 Retry" });
      rb.addEventListener("click", async () => { ee!.style.display = "none"; await this.callbacks.onRetry(); });
    }
    ee.style.display = "flex";
  }

  _he(): void { const e = this.c.querySelector(".deepseek-error-bar") as HTMLElement | null; if (e) e.style.display = "none"; }
  private _sc(): void { requestAnimationFrame(() => { this.msgs.scrollTop = this.msgs.scrollHeight; }); }

  clear(): void {
    this.m = []; this.msgs.empty(); this._he();
    this.st = false; this.ce = null; this.cw = null; this._cla();
  }

  _aam(ct: string): void { const msg: ChatMessage = { role: "assistant", content: ct }; this.m.push(msg); this.am(msg); }
  _gms(): ChatMessage[] { return this.m; }
  _gafn(): string | null { return this.af?.name || null; }

  setModelMode(md: "chat"|"reasoner"): void {
    if (this.mtb) { this.mtb.textContent = ""; this.mtb.createSpan({ text: md === "reasoner" ? "🧠" : "🚀" }); }
    this._curModel = md;
  }

  private _mpop(): void {
    const old = document.querySelector(".deepseek-model-popup");
    if (old) { old.remove(); return; }
    const pop = document.createElement("div");
    pop.className = "deepseek-model-popup";
    pop.style.cssText = "position:fixed;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:8px;padding:4px;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,0.3);min-width:180px";
    const items = [
      { id: "chat", label: "⚡ V4 Flash", desc: "deepseek-chat" },
      { id: "reasoner", label: "🧠 V4 Pro", desc: "deepseek-reasoner" },
    ];
    items.forEach((it) => {
      const btn = pop.createEl("button", { cls: "deepseek-popup-item", text: it.label + "  " + it.desc });
      btn.style.cssText = "display:block;width:100%;padding:8px 12px;border:none;background:transparent;cursor:pointer;text-align:left;border-radius:4px;font-size:13px";
      btn.addEventListener("mouseenter", () => { btn.style.background = "var(--background-modifier-hover)"; });
      btn.addEventListener("mouseleave", () => { btn.style.background = "transparent"; });
      const isActive = (it.id === "chat" && this._curModel === "chat") || (it.id === "reasoner" && this._curModel === "reasoner");
      if (isActive) { btn.style.background = "var(--background-modifier-hover)"; btn.style.fontWeight = "bold"; }
      btn.addEventListener("click", () => { pop.remove(); this.callbacks.onSetModel(it.id as "chat"|"reasoner"); });
    });
    const r = this.mtb!.getBoundingClientRect();
    pop.style.left = r.left + "px";
    pop.style.bottom = (window.innerHeight - r.top + 8) + "px";
    document.body.appendChild(pop);
    const close = (e: MouseEvent) => { if (!pop.contains(e.target as Node) && e.target !== this.mtb) { pop.remove(); document.removeEventListener("click", close); } };
    setTimeout(() => document.addEventListener("click", close), 10);
  }

  amsg(msg: ChatMessage): HTMLElement { return this.am(msg); }
  addMessage(msg: ChatMessage): HTMLElement { return this.am(msg); }
  addAssistantMessage(c: string): void { this._aam(c); }
  getMessages(): ChatMessage[] { return this._gms(); }
  finalizeStreaming(): void { this._fin(); }
  appendToAssistant(d: string, done?: boolean): void { this._app(d, done); }
  cancelStreaming(): void { this._cxl(); }
  showError(m: string, sr?: boolean): void { this.se(m, sr); }
  hideError(): void { this._he(); }
  updateContextLabel(l: string): void { this._ulbl(l); }
  clearAttachment(): void { this._cla(); }
  showAttachmentBadge(n: string): void { this._sab(n); }
  getAttachedFile(): File | null { return this._gaf(); }
  setStopCallback(cb: (() => void) | null): void {
    this.stopCallback = cb;
    if (this.stopBtn) this.stopBtn.style.display = cb ? "inline-flex" : "none";
  }
}