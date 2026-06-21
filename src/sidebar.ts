import { ItemView, WorkspaceLeaf, MarkdownView, Notice, TFile } from "obsidian";
import type DeepSeekPlugin from "../main";
import { ChatView } from "./ui/chat-view";
import { DeepSeekError } from "./types";
import { getParserForFile } from "./parsers/index";
import { Sanitizer } from "./sanitizer";
export const VIEW_TYPE_DEEPSEEK_CHAT = "deepseek-chat-sidebar";

const MATH = "Math: $x$ inline, $$x$$ block. Never \\(x\\) or \\[x\\].";
const SYNTAX = "Links: [[wikilink]]. Callouts: > [!summary]/[!note]/[!example]/[!tip]/[!warning].";
const TEMPLATE = `When user asks to create/save/generate a note (生成笔记/创建笔记):
- Start with # 描述性标题 (NOT generic "AI Response" or conversation text)
- Use frontmatter (---) with title, date, tags
- Organize with ## ### headings, tables, callouts as appropriate
- End with 2-4 [[wikilinks]] to related concepts
Otherwise answer conversationally: no # headings, no frontmatter, just ## sections and natural prose.
Do NOT auto-create notes unless the user explicitly asks.`;

const NOTE_METHODOLOGY = `
You are an adaptive Obsidian tutor and note-organizer. ADD VALUE, not reformat mechanically.

CONTENT RULES:
- Understand the user's need. If unclear, ask ONE short clarifying question.
- Teach with intuition, examples, mnemonics, and comparisons.
- Vary structure per topic — mix prose, tables, callouts, Q&A. Never repeat one template.
- Cover material proportionally. Don't spend 80% of words on 10% of content.
- Rewrite in your own words. Add insights the source lacks.
- End with 2-4 [[wikilinks]] to related concepts.

FORMAT RULES — follow strictly:
- ## for main sections, ### for subsections. No # (reserved for note title). Never skip levels.
- Exactly one blank line between sections and after each header. Paragraphs max 5 sentences.
- Callouts: [!summary]=key takeaway, [!note]=context, [!example]=worked case, [!tip]=memory trick, [!warning]=common mistake. Place [!summary] at top when summarizing.
- Lists: - for bullets, 1. for steps. 2-space indent for nesting. No orphan items.
- **Bold** key terms on first mention. *Italic* for light emphasis only.
- Tables: align |:---| left, |:---:| center, |---:| right. Header row required.
- Inline code \`var\` for variables. \`\`\`lang for code blocks.
- --- horizontal rule only between major topic shifts. Sparingly.
- NO trailing whitespace. NO empty headers. NO consecutive blank lines.
`;

const CANVAS_FULL = `You are a knowledge-graph builder. First ANALYZE the content, then OUTPUT a canvasjson mindmap.

PHASE 1 — EXTRACT WISDOM (Fabric pattern)
Before creating nodes, mentally extract:
1. CENTRAL IDEA: The single most important takeaway (becomes root node)
2. KEY CONCEPTS: 4-8 major themes/categories, MECE-organized (Level 1 nodes)
3. SUPPORTING DETAILS: 1-3 specifics per concept (node bullet points)
4. CROSS-CONNECTIONS: Concepts that relate across categories (cross-edges, color "6")
5. EMERGENT INSIGHT: Something implied but unsaid (add as a "lightbulb" node, color "5")

PHASE 2 — BUILD CANVAS JSON
Output ONLY a \`\`\`canvasjson block. Format:
{
  "nodes": [
    {"id":"n1","type":"text","text":"# Central Idea\\nOne-sentence essence + 1-2 key takeaways","color":"4"},
    {"id":"n2","type":"text","text":"## Concept Name\\n- Specific point 1\\n- Specific point 2\\n- Related: n3","color":"2"}
  ],
  "edges": [
    {"id":"e1","fromNode":"n1","toNode":"n2"},
    {"id":"e2","fromNode":"n2","toNode":"n3","label":"contrasts with"}
  ]
}

Node rules:
- Root (n1): Complete statement, not just a topic name. Color "4" (blue). 2-3 sentences.
- Level 1 concepts: Substantive labels. Color "2" (green). 2-4 bullet points.
- Insight nodes: Color "5" (yellow). For emergent insights.
- Cross-ref nodes: Color "6" (purple). Connected with labeled cross-edges.
- Each node max 400 chars. Bullet points must be specific, not generic.
- NO duplicate content across nodes — each concept appears exactly once.

Edge rules:
- Every non-root node connects to exactly one parent (tree structure).
- Add 2-4 cross-edges between related concepts at the same level with labels.
- Edge labels: "depends on", "contrasts with", "example of", "leads to", "part of".

Scale: 6-16 nodes total. Max 3 levels deep (root, concept, detail).
Do NOT include x, y, width, height — layout is handled automatically.`;

function treeLayout(
  nodes: Array<Record<string, unknown>>,
  edges: Array<Record<string, unknown>>,
): void {
  if (!nodes || nodes.length === 0) return;
  const childrenMap = new Map<string, string[]>();
  for (const n of nodes) childrenMap.set(n.id as string, []);
  for (const e of edges) {
    const from = e.fromNode as string;
    const to = e.toNode as string;
    if (childrenMap.has(from)) childrenMap.get(from)!.push(to);
  }
  const hasParent = new Set<string>();
  for (const e of edges) hasParent.add(e.toNode as string);
  const roots = nodes.filter(n => !hasParent.has(n.id as string));
  const root = roots.length > 0 ? roots[0] : nodes[0];
  const levels: Array<Array<Record<string, unknown>>> = [[root]];
  const visited = new Set<string>([root.id as string]);
  let queue = [root];
  while (queue.length > 0) {
    const next: Array<Record<string, unknown>> = [];
    for (const parent of queue) {
      for (const kidId of childrenMap.get(parent.id as string) || []) {
        if (visited.has(kidId)) continue;
        visited.add(kidId);
        const kid = nodes.find(n => n.id === kidId);
        if (kid) next.push(kid);
      }
    }
    if (next.length > 0) levels.push(next);
    queue = next;
  }
  for (const n of nodes) {
    if (!visited.has(n.id as string)) {
      if (levels.length === 0) levels.push([n]);
      else levels[levels.length - 1].push(n);
    }
  }
  for (const n of nodes) {
    const text = (typeof n.text === "string" ? n.text : "") as string;
    const lines = text.split("\n");
    const maxLine = Math.max(...lines.map(l => l.length), 20);
    n.width = Math.min(Math.max(maxLine * 8 + 40, 260), 520);
    n.height = Math.min(lines.length * 22 + 60, 400);
  }
  const GAP_X = 60; const GAP_Y = 80;
  let y = 0;
  for (const level of levels) {
    const totalW = level.reduce((s, n) => s + ((n.width as number) || 300), 0)
      + (level.length - 1) * GAP_X;
    let x = Math.max(20, Math.round((900 - totalW) / 2));
    for (const n of level) {
      n.x = x; n.y = y;
      x += ((n.width as number) || 300) + GAP_X;
    }
    y += Math.max(...level.map(n => (n.height as number) || 200)) + GAP_Y;
  }
}

export class DeepSeekSidebarView extends ItemView {
  plugin: DeepSeekPlugin;
  chatView!: ChatView;
  private cp = "";
  private afc: string | null = null;
  private afn: string | null = null;
  private lfm: string | null = null;
  private st: ReturnType<typeof setTimeout> | null = null;
  private mm: "chat" | "reasoner" = "chat";
  private cachedSp = "";
  private cachedSpNote: string | null = null;
  private apiMsgs: Array<{ role: string; content: string }> = [];
  private abortController: AbortController | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: DeepSeekPlugin) { super(leaf); this.plugin = plugin; }
  getViewType(): string { return VIEW_TYPE_DEEPSEEK_CHAT; }
  getDisplayText(): string { return "DeepSeek Assistant"; }
  getIcon(): string { return "message-square"; }

  async onOpen(): Promise<void> {
    const c = this.containerEl.children[1] as HTMLElement; c.empty();
    this.chatView = new ChatView(c, this.plugin);
    this.chatView.callbacks.onSend = async (m) => { await this.hcs(m); };
    this.chatView.callbacks.onAttachFile = async (f) => { await this.haf(f); };
    this.chatView.callbacks.onOpenNote = async (p) => { await this._openNote(p); };
    this.chatView.callbacks.onRetry = async () => { await this.hr(); };
    this.chatView.callbacks.onCreateCanvas = async (c2) => { await this.hcc(c2); };
    this.chatView.callbacks.onSetModel = async (md: "chat"|"reasoner") => { await this.hsm(md); };
    this.chatView.callbacks.onNewConversation = () => { this._startNewConversation(); };
    this.chatView.callbacks.onSwitchConversation = (id: string) => { this._loadConversation(id); };
    this.registerEvent(this.plugin.app.workspace.on("active-leaf-change", () => { this.oanc(); }));
    this.sum(); this.oanc();
    this._updateHistoryUI();
  }

  async onClose(): Promise<void> { this.pc(); this.containerEl.children[1]?.empty(); }
  getcpt(): string { return this.cp; }
  sum(): void { this.mm = this.plugin.settings.model === "deepseek-reasoner" ? "reasoner" : "chat"; this.chatView.setModelMode?.(this.mm); }
  sum2(m: string): void { this.chatView.setModelMode?.(m as "chat"|"reasoner"); }

  private async hsm(md: "chat"|"reasoner"): Promise<void> {
    this.mm = md;
    this.plugin.settings.model = md === "reasoner" ? "deepseek-reasoner" : "deepseek-chat";
    await this.plugin.saveSettings();
    const k = this.plugin.getEffectiveApiKey();
    this.plugin.apiClient.updateConfig(this.plugin.settings.baseUrl, k, this.plugin.settings.model, this.plugin.settings.reasoningEffort);
    this.sum2(this.mm);
    new Notice(md === "reasoner" ? "Switched: V4 Pro" : "Switched: V4 Flash");
  }

  // ---- Persistence ----
  private pc(): void {
    if (!this.cp) return;
    const ms = this.chatView.getMessages();
    if (ms.length === 0) {
      delete this.plugin.settings.conversations[this.cp];
    } else {
      const toSave = [...ms.slice(-30)];
      if (this.cachedSp && !toSave.some(m => m.role === "system")) {
        toSave.unshift({ role: "system", content: this.cachedSp });
      }
      this.plugin.settings.conversations[this.cp] = toSave;
      this._extractMemory(ms);
    }
    if (this.st) clearTimeout(this.st);
    this.st = setTimeout(async () => { await this.plugin.saveSettings(); }, 500);
  }

  private _extractMemory(msgs: Array<{ role: string; content: string }>): void {
    if (!this.plugin.settings.memoryEnabled || !this.plugin.memory) return;
    const userMsgs = msgs.filter(m => m.role === "user" && m.content.trim());
    const assistantMsgs = msgs.filter(m => m.role === "assistant" && m.content.trim());
    if (userMsgs.length < 2) return;
    this.plugin.memory.extractFromConversation(
      this.cp,
      userMsgs.map(m => m.content),
      assistantMsgs.map(m => m.content),
    ).catch(e => console.error("[Memory] extract fail:", e));
  }

  private lc(np: string): void {
    const sv = this.plugin.settings.conversations[np];
    if (sv) {
      for (const m of sv) { if (m.role === "user") this.chatView.addMessage(m); else if (m.role === "assistant") this.chatView.addAssistantMessage(m.content); }
      const sysMsg = sv.find(m => m.role === "system");
      if (sysMsg) { this.cachedSp = sysMsg.content; this.cachedSpNote = np; }
      this.apiMsgs = sv.map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
    }
  }

  private _updateCtx(label: string): void {
    const hitRate = this.cacheTotal > 0 ? Math.round((this.cacheHits / this.cacheTotal) * 100) : 0;
    const cacheTag = this.apiMsgs.length >= 3 ? ` cache ${hitRate}%` : "";
    this.chatView.updateContextLabel(label + cacheTag);
  }

  private oanc(): void {
    const v = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    const np = v?.file?.path || "";
    if (np !== this.cp) {
      this.pc(); this.cp = np; this.caf(); this.cacheHits = 0; this.cacheTotal = 0;
      // 不清理对话框！仅更新上下文标签。只有「新建会话」按钮才清空对话。
      if (v?.file) this._updateCtx(v.file.basename + " (" + v.file.path + ")");
      else this._updateCtx("No note");
    }
  }

  private gnc(): string | null {
    const v = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!v) return null; const s = v.editor.getSelection(); return s.trim() || v.editor.getValue();
  }

  private gvt(): string[] { return this.plugin.app.vault.getMarkdownFiles().map(f => f.basename).filter(n => n.length > 0); }
  private bvc(): string {
    const t = this.gvt(); if (t.length === 0) return "";
    const mx = Math.min(t.length, 20), sh = t.slice(0, mx);
    return "Vault(" + t.length + "): " + sh.map(n => "[[" + n + "]]").join(", ");
  }

  // ---- Files ----
  private async haf(file: File): Promise<void> {
    try {
      const p = await getParserForFile(file.name); if (!p) throw new Error("Unsupported: " + file.name);
      const b = await file.arrayBuffer(); const c = await p.parse(b);
      if (!c.trim()) throw new Error("Empty file");
      this.afc = c; this.afn = file.name;
      this.apiMsgs = [];
      new Notice("Loaded: " + file.name + " (" + c.length + " chars)");
      this.chatView.updateContextLabel(file.name + " (attached)");
    } catch (e) { this.chatView.clearAttachment(); throw e; }
  }
  private caf(): void { this.afc = null; this.afn = null; this.apiMsgs = []; }

  // ---- Apply to Note ----
  private async han(content: string): Promise<void> {
    const v = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    const s = v?.editor.getSelection()?.trim();
    try {
      if (s && v) { v.editor.replaceSelection(content); new Notice("Replaced selection"); }
      else if (this.cp && v) { v.editor.setValue(content); const f = this.plugin.app.vault.getAbstractFileByPath(this.cp); if (f instanceof TFile) await this.plugin.app.vault.modify(f, content); new Notice("Updated note"); }
      else await this.cnn(content);
    } catch (e) { throw new Error(e instanceof Error ? e.message : "Write failed"); }
  }

  // 打开已保存的笔记
  private async _openNote(notePath: string): Promise<void> {
    const f = this.plugin.app.vault.getAbstractFileByPath(notePath);
    if (f instanceof TFile) await this.plugin.app.workspace.getLeaf("split").openFile(f);
    else new Notice("笔记未找到: " + notePath);
  }

  // ---- 会话管理 ----
  private _updateHistoryUI(): void {
    const saved = this.plugin.settings.savedConversations || [];
    this.chatView.showHistoryList(saved.map(c => ({ id: c.id, title: c.title })));
  }

  private _startNewConversation(): void {
    // 先保存当前对话（如果有内容）
    const msgs = this.chatView.getMessages();
    if (msgs.length > 0) {
      const saved = this.plugin.settings.savedConversations || [];
      const firstUser = msgs.find(m => m.role === "user");
      const title = firstUser?.content?.slice(0, 40) || "对话 " + new Date().toLocaleString();
      saved.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        title,
        messages: [...msgs],
        timestamp: Date.now(),
      });
      // 只保留最近 5 个
      if (saved.length > 5) saved.splice(0, saved.length - 5);
      this.plugin.settings.savedConversations = saved;
      this.plugin.saveSettings();
    }
    // 清空并开始新对话
    this.apiMsgs = []; this.cachedSp = ""; this.cachedSpNote = null;
    this.chatView.clear();
    this._updateHistoryUI();
    new Notice("新会话已开始");
  }

  private _loadConversation(id: string): void {
    const saved = this.plugin.settings.savedConversations || [];
    const conv = saved.find(c => c.id === id);
    if (!conv) { new Notice("对话未找到"); return; }
    // 保存当前对话
    const curMsgs = this.chatView.getMessages();
    if (curMsgs.length > 0) {
      const firstUser = curMsgs.find(m => m.role === "user");
      saved.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        title: firstUser?.content?.slice(0, 40) || "对话 " + new Date().toLocaleString(),
        messages: [...curMsgs],
        timestamp: Date.now(),
      });
      if (saved.length > 5) saved.splice(0, saved.length - 5);
    }
    // 从列表中移除要加载的对话
    const idx = saved.findIndex(c => c.id === id);
    if (idx !== -1) saved.splice(idx, 1);
    this.plugin.settings.savedConversations = saved;
    this.plugin.saveSettings();
    // 加载对话
    this.chatView.clear();
    this.apiMsgs = [];
    for (const m of conv.messages) {
      if (m.role === "user") this.chatView.addMessage(m);
      else if (m.role === "assistant") this.chatView.addAssistantMessage(m.content);
    }
    this._updateHistoryUI();
    new Notice("已恢复: " + conv.title.slice(0, 30));
  }

  // 自动保存 AI 回复为新笔记，返回完整路径
  private async _autoSaveNote(content: string): Promise<string> {
    const fd = this.plugin.settings.defaultTargetFolder || "Knowledge";
    if (!this.plugin.app.vault.getAbstractFileByPath(fd)) await this.plugin.app.vault.createFolder(fd);
    const { title: pt, tags, body } = this.efm(content);
    const bn = pt || "AI Response";
    const sn = bn.replace(/[\\/:*?"<>|#^\[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
    let fn = sn + ".md"; let c2 = 1;
    while (this.plugin.app.vault.getAbstractFileByPath(fd + "/" + fn)) { fn = sn + " (" + c2 + ").md"; c2++; }
    const hf = /^---\n[\s\S]*?\n---/.test(body.trimStart());
    const fc = hf ? body.trimStart() : ["---", "title: " + sn, "date: " + new Date().toISOString().slice(0, 10), "created: " + new Date().toISOString(), tags.length > 0 ? "tags: [" + tags.join(", ") + "]" : "", "---", "", body.trim()].filter(l => l !== "").join("\n");
    const fullPath = fd + "/" + fn;
    await this.plugin.app.vault.create(fullPath, fc);
    return fullPath;
  }
  private etf(content: string): string[] {
    const t: string[] = [];
    const h = content.match(/#[\w\u4e00-\u9fa5-]+/g); if (h) for (const x of h) { const c = x.replace(/^#/, "").trim(); if (c && c.length < 30 && !/^\d+$/.test(c)) t.push(c); }
    const w = content.match(/\[\[([^\]]+)\]\]/g); if (w) for (const x of w) { const n = x.replace(/^\[\[|\]\]$/g, "").split("|")[0].trim(); if (n && !t.includes(n)) t.push(n); }
    return [...new Set(t)].slice(0, 15);
  }
  private efm(content: string): { title: string; tags: string[]; body: string } {
    let body = content, title = ""; const tags: string[] = [];
    const fm = content.match(/^---\n([\s\S]*?)\n---\n?/);
    if (fm) { body = content.slice(fm[0].length); const tm = fm[1].match(/^title:\s*(.+)$/m); if (tm) title = tm[1].trim().replace(/^["']|["']$/g, ""); const tgs = fm[1].match(/^tags:\s*\[(.+)\]$/m); if (tgs) for (const t of tgs[1].split(",")) { const c = t.trim().replace(/^["']|["']$/g, ""); if (c) tags.push(c); } }
    if (!title) { const h = body.match(/^#\s+(.+)$/m); if (h) title = h[1].trim(); }
    if (!title) title = body.trim().split("\n")[0].replace(/^#+\s*/, "").trim().slice(0, 60);
    for (const t of this.etf(content)) { if (!tags.includes(t)) tags.push(t); }
    return { title, tags, body };
  }
  private async cnn(content: string): Promise<void> {
    const fd = this.plugin.settings.defaultTargetFolder || "Knowledge";
    if (!this.plugin.app.vault.getAbstractFileByPath(fd)) await this.plugin.app.vault.createFolder(fd);
    const { title: pt, tags, body } = this.efm(content); const bn = pt || "AI Note";
    const sn = bn.replace(/[\\/:*?"<>|#^\[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
    let fn = sn + ".md"; let c2 = 1;
    while (this.plugin.app.vault.getAbstractFileByPath(fd + "/" + fn)) { fn = sn + " (" + c2 + ").md"; c2++; }
    const hf = /^---\n[\s\S]*?\n---/.test(body.trimStart());
    const fc = hf ? body.trimStart() : ["---", "title: " + sn, "date: " + new Date().toISOString().slice(0, 10), "created: " + new Date().toISOString(), tags.length > 0 ? "tags: [" + tags.join(", ") + "]" : "", "---", "", body.trim()].filter(l => l !== "").join("\n");
    await this.plugin.app.vault.create(fd + "/" + fn, fc);
    const nf = this.plugin.app.vault.getAbstractFileByPath(fd + "/" + fn);
    if (nf instanceof TFile) await this.plugin.app.workspace.getLeaf("split").openFile(nf);
  }

  // ---- Canvas ----
  private pcj(content: string): string | null {
    const cb = content.match(/```(?:canvasjson|canvas)\s*([\s\S]*?)```/); if (cb) return cb[1].trim();
    const jm = content.match(/\{[\s\S]*"nodes"[\s\S]*"edges"[\s\S]*\}/); if (jm) return jm[0]; return null;
  }

  private async ccf(js: string): Promise<void> {
    const fd = this.plugin.settings.defaultTargetFolder || "Knowledge";
    if (!this.plugin.app.vault.getAbstractFileByPath(fd)) await this.plugin.app.vault.createFolder(fd);
    let o: Record<string, unknown>; try { o = JSON.parse(js); } catch { throw new Error("Invalid Canvas JSON"); }
    if (!o.nodes || !Array.isArray(o.nodes)) throw new Error("Missing nodes");
    if (!o.edges) o.edges = [];
    (o.edges as Array<Record<string, unknown>>).forEach((e, i) => { if (!e.id) e.id = "e" + (i + 1); });
    treeLayout(o.nodes as Array<Record<string, unknown>>, o.edges as Array<Record<string, unknown>>);
    const rn = (o.nodes as Array<Record<string, unknown>>)[0];
    const rt = typeof rn?.text === "string" ? rn.text : "";
    const bn = (rt.split("\n")[0] || "Knowledge Map").replace(/^#+\s*/, "").replace(/[\\/:*?"<>|#^\[\]]/g, "").trim().slice(0, 80) || "Knowledge Map";
    let fn = bn + ".canvas"; let c2 = 1;
    while (this.plugin.app.vault.getAbstractFileByPath(fd + "/" + fn)) { fn = bn + " (" + c2 + ").canvas"; c2++; }
    await this.plugin.app.vault.create(fd + "/" + fn, JSON.stringify(o, null, 2));
    new Notice("Canvas: " + fd + "/" + fn + " (" + (o.nodes as Array<unknown>).length + " nodes, " + (o.edges as Array<unknown>).length + " edges)");
    const nf = this.plugin.app.vault.getAbstractFileByPath(fd + "/" + fn);
    if (nf instanceof TFile) await this.plugin.app.workspace.getLeaf("split").openFile(nf);
  }

  private async hcc(content: string): Promise<void> {
    const j = this.pcj(content);
    if (j) { await this.ccf(j); return; }
    this.chatView.showProgress("正在生成知识图谱...");
    try {
      const generated = await this._generateCanvasJson(content);
      if (generated) { await this.ccf(generated); return; }
    } catch (e) { console.error("[DeepSeek] Canvas fail:", e); }
    finally { this.chatView.hideProgress(); }
    new Notice("Fallback: single-node canvas", 6000);
    const title = content.split("\n")[0].replace(/^#+\s*/, "").trim().slice(0, 60) || "Note";
    const autoJson = JSON.stringify({
      nodes: [{ id: "n1", type: "text", text: content.slice(0, 3000), x: 0, y: 0, width: 500, height: 400, color: "4" }],
      edges: []
    });
    await this.ccf(autoJson);
  }

  private async _generateCanvasJson(content: string): Promise<string | null> {
    const ek = this.plugin.getEffectiveApiKey();
    if (!ek || !ek.trim()) return null;
    const msgs = [
      { role: "system", content: CANVAS_FULL },
      { role: "user", content: "Convert this content into a canvasjson knowledge graph. First extract wisdom (central idea, key concepts, cross-connections), then build the JSON. Output ONLY the ```canvasjson block:\n\n" + content.slice(0, 8000) },
    ];
    const resp = await this.plugin.apiClient.chat(msgs as import("./types").ChatMessage[], { stream: false, maxTokens: 4096, topP: 0.5 }) as string;
    return this.pcj(resp);
  }

  // ---- Retry ----
  private async hr(): Promise<void> {
    if (!this.lfm) { new Notice("Nothing to retry"); return; }
    this.apiMsgs = [];
    const m = this.lfm; this.lfm = null; await this.hcs(m);
  }

  stopGeneration(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
      this.chatView.cancelStreaming();
      new Notice("Stopped");
    }
  }

  // ---- Chat Core ----
  private cacheHits = 0;
  private cacheTotal = 0;

  // 在 vault 中全文搜索，返回匹配的笔记摘要
  private async _searchVault(query: string, maxResults = 5): Promise<Array<{ path: string; title: string; excerpt: string }>> {
    const files = this.plugin.app.vault.getMarkdownFiles();
    if (files.length === 0) return [];
    const qw = query.toLowerCase().split(/[\s，,。！？、；：""''（）\[\]【】《》]+/).filter(w => w.length >= 2);
    if (qw.length === 0) return [];
    // 先按文件名/路径评分，取 top 50 候选（避免遍历数千文件）
    const candidates: Array<{ file: typeof files[0]; fnScore: number }> = [];
    for (const f of files) {
      let s = 0;
      const fn = f.basename.toLowerCase();
      const fp = f.path.toLowerCase();
      for (const w of qw) {
        if (fn.includes(w)) s += 10;
        if (fp.includes(w)) s += 5;
      }
      if (s > 0) candidates.push({ file: f, fnScore: s });
    }
    candidates.sort((a, b) => b.fnScore - a.fnScore);
    const results: Array<{ path: string; title: string; excerpt: string; score: number }> = [];
    for (const { file: f, fnScore } of candidates.slice(0, 50)) {
      try {
        const content = await this.plugin.app.vault.read(f);
        let score = fnScore;
        const lower = content.toLowerCase();
        for (const w of qw) {
          let idx = -1;
          while ((idx = lower.indexOf(w, idx + 1)) !== -1) score++;
        }
        let excerpt = "";
        const firstMatch = qw.find(w => lower.includes(w));
        if (firstMatch) {
          const pos = lower.indexOf(firstMatch);
          const start = Math.max(0, pos - 60);
          excerpt = content.slice(start, start + 200).replace(/\n/g, " ").trim();
        }
        if (score > 5) results.push({ path: f.path, title: f.basename, excerpt: excerpt || content.slice(0, 200), score });
      } catch { /* skip */ }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxResults).map(r => ({ path: r.path, title: r.title, excerpt: r.excerpt }));
  }

  // 根据路径或标题查找并读取笔记全文
  private async _readVaultNote(nameOrPath: string): Promise<{ path: string; content: string } | null> {
    const files = this.plugin.app.vault.getMarkdownFiles();
    const q = nameOrPath.trim().toLowerCase();
    let f = files.find(x => x.path.toLowerCase() === q);
    if (!f) f = files.find(x => x.basename.toLowerCase() === q || x.basename.toLowerCase() === q + ".md");
    if (!f) f = files.find(x => x.basename.toLowerCase().includes(q) || x.path.toLowerCase().includes(q));
    if (!f) return null;
    try {
      const content = await this.plugin.app.vault.read(f);
      return { path: f.path, content };
    } catch { return null; }
  }

  // 检测用户是否显式要求读某笔记
  private _detectReadNoteRequest(msg: string): string | null {
    const patterns = [
      /(?:读一下|读取|读|看看|查看|打开)\s*[「『""]?(.+?)[」』""]?\s*(?:笔记|文件)?\s*$/,
      /(?:read|open|show)\s+(?:the\s+)?(?:note\s+|file\s+)?["']?(.+?)["']?\s*$/i,
      /(?:帮我读|帮我查|帮我找)\s*(?:一下|一哈)?\s*[「『""]?(.+?)[」』""]?/,
    ];
    for (const p of patterns) {
      const m = msg.match(p);
      if (m && m[1] && m[1].trim().length >= 1) return m[1].trim();
    }
    return null;
  }

  // 检测用户是否明确要求生成笔记 / 知识图谱
  private _shouldAutoSaveNote(msg: string): boolean {
    const patterns = [
      /生成笔记|创建笔记|写(?:一)?篇笔记|保存(?:为)?笔记|做笔记|记笔记|整理成笔记|输出(?:为)?笔记|总结成笔记/,
      /(?:make|create|write|save|generate)\s+(?:a\s+)?note/i,
      /summarize\s+(?:as|into)\s+(?:a\s+)?note/i,
      /生成知识图谱|画知识图谱|创建白板|知识网络|knowledge\s*(?:graph|map)/i,
    ];
    return patterns.some(p => p.test(msg));
  }

  // 构建增强的 vault 上下文：文件夹结构 + 全文搜索结果
  private async _buildVaultContext(userQuery: string): Promise<string> {
    const files = this.plugin.app.vault.getMarkdownFiles();
    if (files.length === 0) return "";
    const folders = new Set<string>();
    for (const f of files) {
      const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "/";
      folders.add(dir);
    }
    const folderList = [...folders].sort().slice(0, 15);
    let ctx = "\n[Vault: " + files.length + " 篇笔记, " + folderList.length + " 个目录]\n";
    ctx += "目录: " + folderList.map(d => d === "/" ? "根目录" : d).join(" | ") + "\n";
    const results = await this._searchVault(userQuery, 5);
    if (results.length > 0) {
      ctx += "\n🔍 匹配的笔记:\n";
      for (const r of results) {
        ctx += `- [[${r.path}|${r.title}]]: "${r.excerpt.slice(0, 150)}"\n`;
      }
    }
    return ctx;
  }

  private async hcs(um: string): Promise<void> {
    const ek = this.plugin.getEffectiveApiKey();
    if (!ek) { this.lfm = um; this.chatView.cancelStreaming(); this.chatView.showError("API Key not configured."); return; }
    this.lfm = null;
    this.plugin.apiClient.updateConfig(this.plugin.settings.baseUrl, ek, this.plugin.settings.model, this.plugin.settings.reasoningEffort);

    // 基础系统提示词（缓存，不随每条消息变化）
    const needNewBaseSp = this.cp !== this.cachedSpNote || !this.cachedSp || this.apiMsgs.length === 0;
    if (needNewBaseSp) {
      const nc = this.gnc();
      // 检测用户是否要求读特定笔记
      const readTarget = this._detectReadNoteRequest(um);
      let readContent = "";
      if (readTarget) {
        const note = await this._readVaultNote(readTarget);
        if (note) {
          readContent = "\n📖 用户要求读取笔记: " + note.path + "\n---\n" + note.content.slice(0, 8000) + "\n---\n";
          new Notice("已读取: " + note.path);
        }
      }
      // 构建增强的 vault 上下文（文件夹 + 全文搜索）
      const vaultCtx = await this._buildVaultContext(um);
      let sp = NOTE_METHODOLOGY + "\n" + MATH + "\n" + SYNTAX + "\n" + TEMPLATE + "\n";
      if (nc && this.afc) sp += "User reference (excerpt):\n--- NOTE ---\n" + nc.slice(0, 1500) + "\n---\nAttached: " + this.afn + ":\n--- FILE ---\n" + this.afc.slice(0, 3000) + "\n---\n";
      else if (this.afc) sp += "Attached file (" + this.afn + "):\n---\n" + this.afc.slice(0, 4000) + "\n---\n";
      else if (nc) sp += "Reference note (excerpt):\n---\n" + nc.slice(0, 2000) + "\n---\n";
      if (this.plugin.settings.memoryEnabled && this.plugin.memory) {
        const memories = this.plugin.memory.retrieve(um + "\n" + (nc || ""));
        if (memories.length > 0) sp += "\n[Memory]\n" + memories.map(m => "- " + m.title + ": " + m.content.slice(0, 300)).join("\n") + "\n[/Memory]\n";
      }
      if (this.plugin.settings.sanitizerEnabled) sp = Sanitizer.sanitizeWithRules(sp, this.plugin.settings.sanitizerRules).sanitized;
      this.cachedSp = sp; this.cachedSpNote = this.cp;
      this.apiMsgs = [];
    }

    // 🔍 每条消息都重建 vault 上下文（不缓存）
    const vaultCtx = await this._buildVaultContext(um);
    const _rt = this._detectReadNoteRequest(um);
    let _rc = "";
    if (_rt) {
      const note = await this._readVaultNote(_rt);
      if (note) {
        _rc = "📖 用户要求读: " + note.path + "\n---\n" + note.content.slice(0, 8000) + "\n---";
        new Notice("已读取: " + note.path);
      }
    }

    this.cacheTotal++;
    const isCacheHit = !needNewBaseSp && this.apiMsgs.length >= 3;
    if (isCacheHit) this.cacheHits++;

    const ms = [...this.apiMsgs];
    if (ms.length === 0) ms.push({ role: "system", content: this.cachedSp });
    // 注入 vault 上下文到用户消息前缀
    let aug = um;
    if (vaultCtx) aug = vaultCtx + "\n---\n用户问题: " + um;
    if (_rc) aug = _rc + "\n\n" + aug;
    ms.push({ role: "user", content: aug });

    this.abortController = new AbortController();
    this.chatView.setStopCallback(() => this.stopGeneration());

    try {
      const r = await this.plugin.apiClient.chat(
        ms as import("./types").ChatMessage[],
        { stream: true, maxTokens: 4096, signal: this.abortController.signal },
      );
      const stm = r as AsyncGenerator<string, void, undefined>;
      for await (const d of stm) this.chatView.appendToAssistant(d);
      this.chatView.finalizeStreaming();
      // 仅在用户明确要求时自动生成笔记（非每次对话都生成）
      const lastMsg = this.chatView.getMessages().filter(m => m.role === "assistant").pop();
      const fullContent = lastMsg?.content || "";
      if (fullContent.trim() && this._shouldAutoSaveNote(um)) {
        const notePath = await this._autoSaveNote(fullContent);
        await this.chatView.finalizeWithNote(notePath);
        new Notice("📝 笔记已生成: " + notePath, 5000);
      } else {
        this.chatView.finalizeWithActions();
      }
      this.apiMsgs = [...ms];
      if (lastMsg) this.apiMsgs.push({ role: "assistant", content: lastMsg.content.slice(0, 2000) });
      if (this.apiMsgs.length > 11) this.apiMsgs = this.apiMsgs.slice(-10);
      if (this.apiMsgs.length > 0 && this.apiMsgs[0].role !== "system") {
        this.apiMsgs.unshift({ role: "system", content: this.cachedSp });
      }
      if (this.cp) {
        const v = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        const label = v?.file ? v.file.basename + " (" + v.file.path + ")" : this.cp;
        this._updateCtx(label);
      }
      this.pc();
    } catch (e) {
      this.chatView.finalizeStreaming();
      if (e instanceof DeepSeekError && e.statusCode === 0 && e.message.includes("超时")) { /* user abort */ }
      else {
        const em = e instanceof DeepSeekError ? e.toUserMessage() : e instanceof Error ? e.message : "Request failed";
        this.chatView.showError(em); this.lfm = um;
      }
    } finally {
      this.abortController = null;
      this.chatView.setStopCallback(null);
    }
  }

  su(content: string): void { this.chatView.addMessage({ role: "user", content }); }
  sa(content: string): void { this.chatView.addAssistantMessage(content); }
  showUserMessage(content: string): void { this.su(content); }
  showAssistantMessage(content: string): void { this.sa(content); }

  async createCanvasFromContent(content: string): Promise<void> {
    this.su("Create knowledge network (Canvas)");
    new Notice("Generating...", 2000);
    try {
      const generated = await this._generateCanvasJson(content);
      if (generated) { await this.ccf(generated); this.sa("Canvas created"); return; }
    } catch (e) { console.error("[DeepSeek] Canvas fail:", e); }
    this.sa("Failed to generate canvas.");
  }

  // ---- Copilot ----
  private _getSelection(): { text: string; editor: import("obsidian").Editor } | null {
    const v = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!v) return null;
    const sel = v.editor.getSelection().trim();
    if (!sel) return null;
    return { text: sel, editor: v.editor };
  }

  async inlinePolish(): Promise<void> {
    const sel = this._getSelection();
    if (!sel) { new Notice("Select text first"); return; }
    new Notice("Polishing...");
    try {
      const msgs = [
        { role: "system", content: "Polish the text: improve flow, fix grammar, keep meaning. Output ONLY the polished text." },
        { role: "user", content: sel.text.slice(0, 3000) },
      ];
      const resp = await this.plugin.apiClient.chat(msgs as import("./types").ChatMessage[], { stream: false, maxTokens: 2048 }) as string;
      if (resp.trim()) { sel.editor.replaceSelection(resp.trim()); new Notice("Polished"); }
    } catch (e) { new Notice("Polish fail: " + (e instanceof Error ? e.message : "Error")); }
  }

  async inlineExplain(): Promise<void> {
    const sel = this._getSelection();
    if (!sel) { new Notice("Select text first"); return; }
    new Notice("Explaining...");
    try {
      const msgs = [
        { role: "system", content: "Explain the selected text clearly with examples. Output in Markdown. Start with '> 原文：' quote, then your explanation." },
        { role: "user", content: sel.text.slice(0, 3000) },
      ];
      const resp = await this.plugin.apiClient.chat(msgs as import("./types").ChatMessage[], { stream: false, maxTokens: 2048 }) as string;
      if (resp.trim()) { sel.editor.replaceSelection(resp.trim()); new Notice("Explained"); }
    } catch (e) { new Notice("Explain fail: " + (e instanceof Error ? e.message : "Error")); }
  }
}