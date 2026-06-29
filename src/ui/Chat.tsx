// ============================================================
// Chat.tsx — 工具调用循环集成
// ============================================================
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Notice } from "obsidian";
import type DeepSeekPlugin from "../../main";
import type { ChatMessage } from "../types";
import { DeepSeekError } from "../types";
import { ChatInput } from "./ChatInput";
import { ChatMessageView } from "./ChatMessage";
import { ChatHistory } from "./ChatHistory";
import { getParserForFile } from "../parsers/index";
import { parseToolCalls, executeToolCall, buildToolsPrompt } from "../tools/toolCallParser";
import type { ToolCallResult } from "../tools/toolCallParser";

/* 快捷提示 */
const SUGGESTED = [
  { icon: "📝", text: "生成摘要", prompt: "请为当前笔记生成摘要" },
  { icon: "🏷️", text: "推荐标签", prompt: "请为当前笔记推荐标签" },
  { icon: "🔗", text: "推荐链接", prompt: "请为当前笔记推荐双向链接" },
  { icon: "🧠", text: "知识图谱", prompt: "请根据当前笔记生成知识图谱" },
  { icon: "✍️", text: "润色笔记", prompt: "请润色当前笔记" },
  { icon: "📋", text: "原子笔记", prompt: "请将当前笔记拆分为原子笔记" },
];

const P_INFO: Record<string, { icon: string; label: string }> = {
  deepseek: { icon: "🔴", label: "DeepSeek" },
  qwen: { icon: "🟠", label: "通义千问" },
  glm: { icon: "🔵", label: "GLM" },
  ollama: { icon: "🦙", label: "Ollama" },
};

interface ChatCallbacks {
  onSaveNote: (content: string) => Promise<string | null>;
  onCreateCanvas: (content: string) => Promise<void>;
  onNewChat: () => void;
}

interface ChatProps {
  plugin: DeepSeekPlugin;
  initialMessages: ChatMessage[];
  notePath: string;
  noteName: string | null;
  onMessagesChange: (msgs: ChatMessage[]) => void;
  onNewConversation: () => void;
  modelMode: "chat" | "reasoner";
  onModelModeChange: (mode: "chat" | "reasoner") => Promise<void>;
  activeProvider: string;
  availableProviders: Array<{ id: string; label: string }>;
  onProviderChange: (provider: string) => Promise<void>;
  chatHistoryItems: Array<{ id: string; title: string; date: string }>;
  callbacks: ChatCallbacks;
}

const MAX_TOOL_ROUNDS = 20; // 硬上限，防止死循环

export const Chat: React.FC<ChatProps> = ({
  plugin, initialMessages, notePath, noteName,
  onMessagesChange, onNewConversation,
  modelMode, onModelModeChange,
  activeProvider, availableProviders, onProviderChange,
  chatHistoryItems, callbacks,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [reasoningText, setReasoningText] = useState("");
  const [reasoningDone, setReasoningDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const [showProviders, setShowProviders] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [toolResults, setToolResults] = useState<ToolCallResult[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamRef = useRef("");

  useEffect(() => { onMessagesChange(messages); }, [messages]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, streamingText, toolResults]);

  // ---- 核心发送 + 工具调用循环 ----
  const runWithTools = useCallback(async (chatMsgs: ChatMessage[]) => {
    setToolResults([]);
    let noToolCount = 0; // 连续无工具轮次计数

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const ctrl = new AbortController(); abortRef.current = ctrl;
      setStreaming(true); setStreamingText(""); setReasoningText(""); setReasoningDone(false);
      let reasoning = "";

      const apiMsgs = await buildApi(plugin, chatMsgs, attachedFile, notePath);
      let full = "";
      try {
        const res = await plugin.modelManager.chat(apiMsgs, activeProvider as any, {
          stream: true, signal: ctrl.signal,
          onReasoning: (chunk: string) => { reasoning += chunk; setReasoningText(reasoning); },
        });
        for await (const d of res as AsyncGenerator<string>) { full += d; streamRef.current = full; setStreamingText(full); }
      } catch (e: any) {
        if (e?.name !== "AbortError" || !streamRef.current.trim()) {
          setError(e instanceof DeepSeekError ? e.toUserMessage() : e instanceof Error ? e.message : "发送失败");
          setStreaming(false); return;
        }
        full = streamRef.current;
      }
      setStreaming(false); setStreamingText("");

      if (!full.trim()) break;

      // Parse tool calls
      const calls = parseToolCalls(full);
      if (calls.length === 0) {
        noToolCount++;
        // 连续 2 轮没有工具调用 → 任务完成，退出
        if (noToolCount >= 2) {
          chatMsgs = [...chatMsgs, { role: "assistant" as const, content: full, id: "a" + Date.now() }];
          setMessages(chatMsgs);
          return;
        }
        // 第一轮无工具 → 继续等待，可能 AI 在思考
        chatMsgs = [...chatMsgs, { role: "assistant" as const, content: full, id: "a" + Date.now() }];
        setMessages(chatMsgs);
        continue;
      }
      noToolCount = 0; // 有工具调用 → 重置计数

      // Strip tool calls from visible content
      let cleanContent = full;
      for (const c of calls) cleanContent = cleanContent.replace(c.rawMatch, "");
      cleanContent = cleanContent.trim();
      if (cleanContent) {
        chatMsgs = [...chatMsgs, { role: "assistant" as const, content: cleanContent, id: "a" + Date.now() }];
        setMessages(chatMsgs);
      }

      // Execute all tools in this round
      const results: ToolCallResult[] = [];
      const toolOutputs: string[] = [];
      for (const call of calls) {
        const r = await executeToolCall(call, plugin);
        results.push(r);
        if (r.error) {
          toolOutputs.push(`[${call.name}] 错误: ${r.error}`);
        } else {
          toolOutputs.push(`[${call.name}] 结果:\n${r.output.slice(0, 2000)}`);
        }
      }
      setToolResults((prev) => [...prev, ...results]);

      // Inject results for next round
      chatMsgs = [...chatMsgs, {
        role: "system" as const,
        content: "工具调用结果：\n" + toolOutputs.join("\n\n"),
      }];
    }

    // 硬上限触发 → 不做特殊处理，直接保留当前对话
  }, [plugin, attachedFile, notePath, activeProvider]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || streaming || analyzing) return;
    const um: ChatMessage = { role: "user", content: text, id: "u" + Date.now() };
    const all = [...messages, um];
    setMessages(all); setError(null);
    await runWithTools(all);
  }, [messages, streaming, runWithTools]);

  // 统一附件处理 — 根据文件类型智能路由
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const handleAttach = useCallback(async (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase() || "";

    // 文本文件 → 直接解析，注入上下文给主模型
    if (["md", "txt"].includes(ext)) {
      try {
        const p = await getParserForFile(f.name);
        if (p) {
          setAttachedFile({ name: f.name, content: await p.parse(await f.arrayBuffer()) });
          new Notice(`已加载：${f.name}`);
        }
      } catch (e: any) { setError(e.message); }
      return;
    }

    // 需要视觉能力的文件 → 路由到多模态接口
    const needsVision = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "pdf"].includes(ext);
    const isWord = ["docx", "doc"].includes(ext);

    if (needsVision) {
      if (!plugin.modelManager.hasVision()) {
        // 没有视觉配置 → PDF 回退到文字提取
        if (ext === "pdf") {
          try {
            const p = await getParserForFile(f.name);
            if (p) {
              setAttachedFile({ name: f.name, content: await p.parse(await f.arrayBuffer()) });
              new Notice(`已加载：${f.name}（文字提取）`);
            }
          } catch { setError("PDF 解析失败，请配置视觉模型以支持扫描件识别。"); }
          return;
        }
        setError("图片识别需要配置视觉模型。请在设置 → 多模态中配置通义千问 VL 或 GLM-4V。");
        return;
      }
      // 有视觉配置 → 调用多模态识别
      setPendingFile(f);
      setAnalyzing(true);
      try {
        const result = await plugin.modelManager.analyzeFile(f);
        setMessages((p) => [...p, {
          role: "system" as const,
          content: `[文件识别: ${f.name}]\n${result.text}`,
        }]);
        new Notice(`已识别：${f.name}`);
      } catch (e: any) { setError("识别失败：" + e.message); }
      finally { setAnalyzing(false); setPendingFile(null); }
      return;
    }

    // Word → 文字提取
    if (isWord) {
      try {
        const p = await getParserForFile(f.name);
        if (p) {
          setAttachedFile({ name: f.name, content: await p.parse(await f.arrayBuffer()) });
          new Notice(`已加载：${f.name}`);
        }
      } catch { setError("Word 解析失败。"); }
      return;
    }

    setError(`不支持的文件类型: .${ext}`);
  }, [plugin]);

  const pi = P_INFO[activeProvider] || P_INFO.deepseek;
  const empty = messages.length === 0 && !streaming;
  const hasVision = plugin.modelManager.hasVision();
  const [ctxNotes, setCtxNotes] = useState<string[]>([]);
  const [ctxNoteContents, setCtxNoteContents] = useState<Record<string, string>>({});

  // Auto-inject active note content
  useEffect(() => {
    if (!notePath) return;
    const f = plugin.app.vault.getAbstractFileByPath(notePath);
    if (!f) return;
    (plugin.app.vault.read(f as any) as Promise<string>).then((c: string) => {
      setCtxNotes([notePath]);
      setCtxNoteContents({ [notePath]: c });
    }).catch(() => {});
  }, [notePath, plugin]);

  const tokenEstimate = useMemo(() => {
    const allText = messages.map(m => m.content).join(" ") + (ctxNoteContents[notePath] || "").slice(0, 1000);
    return Math.ceil(allText.length / 2);
  }, [messages, ctxNoteContents, notePath]);

  const handleExport = useCallback(() => {
    const md = messages.map(m => `### ${m.role === "user" ? "你" : "AI"}\n\n${m.content}\n`).join("\n---\n\n");
    const now = new Date().toISOString().slice(0, 10);
    const path = `AI对话_${now}.md`;
    plugin.app.vault.create(path, `---\ntitle: AI 对话\ndate: ${now}\n---\n\n${md}`).then(() => new Notice("已导出：" + path)).catch(() => new Notice("导出失败"));
  }, [messages, plugin]);

  return (
    <div className="ds-root">
      {/* ===== 工具栏 ===== */}
      <div className="ds-toolbar">
        <div className="ds-tb-left">
          <button className="ds-tb-btn ds-tb-provider" onClick={() => setShowProviders(!showProviders)}>
            <span>{pi.icon}</span><span>{pi.label}</span>
            {activeProvider === "deepseek" && <span className="ds-tb-tag">{modelMode === "reasoner" ? "Pro" : "Flash"}</span>}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          {chatHistoryItems.length > 0 && (
            <button className="ds-tb-btn" onClick={() => setShowHistory(!showHistory)} title="历史">📋</button>
          )}
        </div>
        <div className="ds-tb-right">
          <span className="ds-tb-token" title="估算 Token 数">~{tokenEstimate} tok</span>
          <button className="ds-tb-btn" onClick={handleExport} title="导出对话">📤</button>
          <button className="ds-tb-btn" onClick={() => { callbacks.onNewChat(); setMessages([]); setToolResults([]); }} title="新建">➕</button>
          <button className="ds-tb-btn" onClick={() => callbacks.onSaveNote(messages.map(m => m.content).join("\n\n"))} title="保存">💾</button>
        </div>
      </div>

      {/* 模型选择弹出 */}
      {showProviders && <div className="ds-backdrop" onClick={() => setShowProviders(false)}>
        <div className="ds-popup" onClick={e => e.stopPropagation()}>
          <div className="ds-popup-hd">选择模型</div>
          {availableProviders.filter(p => p.id === "deepseek").map(p => (
            <div key={p.id} className="ds-popup-grp">
              <button className={`ds-popup-item ${activeProvider === "deepseek" && modelMode === "chat" ? "on" : ""}`}
                onClick={() => { onProviderChange("deepseek"); onModelModeChange("chat"); setShowProviders(false); }}>
                <span>🔴 DeepSeek V4 Flash</span><span className="ds-popup-sub">快速响应 · 日常问答</span>
              </button>
              <button className={`ds-popup-item ${activeProvider === "deepseek" && modelMode === "reasoner" ? "on" : ""}`}
                onClick={() => { onProviderChange("deepseek"); onModelModeChange("reasoner"); setShowProviders(false); }}>
                <span>🧠 DeepSeek V4 Pro</span><span className="ds-popup-sub">深度推理 · 复杂问题</span>
              </button>
            </div>
          ))}
          {availableProviders.filter(p => p.id !== "deepseek").map(p => (
            <button key={p.id} className={`ds-popup-item ${activeProvider === p.id ? "on" : ""}`}
              onClick={() => { onProviderChange(p.id); setShowProviders(false); }}>
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </div>}

      {/* 历史弹出 */}
      {showHistory && <div className="ds-backdrop" onClick={() => setShowHistory(false)}>
        <div className="ds-popup" style={{maxWidth:380}} onClick={e => e.stopPropagation()}>
          <div className="ds-popup-hd">对话历史</div>
          <ChatHistory
            items={chatHistoryItems}
            onLoad={(id) => { onNewConversation(); setShowHistory(false); }}
            onDelete={(id) => { plugin.chatPersistence?.deleteConversation?.(id); }}
            onClose={() => setShowHistory(false)}
          />
        </div>
      </div>}

      {/* ===== 附件标签 ===== */}
      {(attachedFile || pendingFile) && (
        <div className="ds-chips">
          {attachedFile && <span className="ds-chip">📄 {attachedFile.name}<button className="ds-chip-x" onClick={() => setAttachedFile(null)}>×</button></span>}
          {pendingFile && <span className="ds-chip ds-chip-img">{analyzing ? "⏳" : "📎"} {pendingFile.name}
            <span className="ds-chip-go">{analyzing ? "识别中…" : "等待"}</span>
          </span>}
        </div>
      )}

      {/* ===== 上下文标签栏 ===== */}
      {ctxNotes.length > 0 && (
        <div className="ds-ctx-bar">
          <span className="ds-ctx-bar-label">上下文:</span>
          <div className="ds-ctx-bar-chips">
            {ctxNotes.map(n => (
              <span key={n} className="ds-ctx-chip">
                📄 {n.split("/").pop()?.replace(".md","")}
                <button className="ds-ctx-chip-x" onClick={() => { setCtxNotes(ctxNotes.filter(x => x !== n)); const c = {...ctxNoteContents}; delete c[n]; setCtxNoteContents(c); }}>×</button>
              </span>
            ))}
            {attachedFile && <span className="ds-ctx-chip">📎 {attachedFile.name}</span>}
          </div>
        </div>
      )}

      {/* ===== 消息区 ===== */}
      <div className="ds-scroll" ref={scrollRef}>
        {empty && (
          <div className="ds-welcome">
            <div className="ds-welcome-icon">💬</div>
            <div className="ds-welcome-title">DeepSeek AI 助手</div>
            <div className="ds-welcome-sub">{noteName ? `当前笔记：${noteName}` : "打开笔记获取上下文，或直接提问"}</div>
            <div className="ds-grid2">
              {SUGGESTED.map((s, i) => (
                <button key={i} className="ds-chip-prompt" onClick={() => send(s.prompt)}>
                  <span>{s.icon}</span><span>{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <ChatMessageView key={m.id || i} message={m} index={i}
            onCopy={(t) => navigator.clipboard.writeText(t).then(() => new Notice("已复制"))}
            onCreateCanvas={(t) => callbacks.onCreateCanvas(t)}
            onRegenerate={() => { const prev = i > 0 && messages[i - 1].role === "user" ? messages[i - 1].content : ""; if (prev) { setMessages(messages.slice(0, i)); send(prev); } }}
            onEdit={() => setEditingIdx(i)}
            onDelete={() => setMessages((p) => p.filter((_, j) => j !== i))}
            isEditing={editingIdx === i}
            onEditSave={(t) => { const u = [...messages]; u[i] = { ...u[i], content: t }; setMessages(u); setEditingIdx(null); if (u[i].role === "user") { const n = u.slice(0, i + 1); setMessages(n); send(t); } }}
            onEditCancel={() => setEditingIdx(null)}
            modelTag={activeProvider === "deepseek" ? (modelMode === "reasoner" ? "V4 Pro" : "V4 Flash") : pi.label}
          />
        ))}

        {/* 工具调用结果卡片 */}
        {toolResults.map((tr, i) => (
          <div key={"tool-" + i} className="ds-msg-row ai">
            <div className="ds-msg-card ds-tool-card">
              <div className="ds-tool-head">
                <span>🔧 {tr.call.name}</span>
                <span className="ds-tool-time">{tr.elapsedMs}ms</span>
              </div>
              {tr.error ? (
                <div className="ds-tool-err">{tr.error}</div>
              ) : (
                <div className="ds-tool-out">{tr.output.slice(0, 1000)}</div>
              )}
            </div>
          </div>
        ))}

        {streaming && (
          <div className="ds-msg-row ai">
            <div className="ds-msg-card">
              <div className="ds-meta">AI 助手</div>
              {reasoningText && (
                <details className="ds-reason" open={!streamingText}>
                  <summary className="ds-reason-summary">
                    💭 思考过程 {!streamingText ? "✓" : ""}
                  </summary>
                  <div className="ds-reason-body">{reasoningText}</div>
                </details>
              )}
              <div className="ds-body">
                {streamingText ? <div className="ds-stream">{streamingText}<span className="ds-cursor" /></div>
                  : !reasoningText ? <div className="ds-loading"><span className="ds-dot" /><span className="ds-dot" /><span className="ds-dot" /></div> : null}
              </div>
              <button className="ds-stop" onClick={() => { abortRef.current?.abort(); }}>⏹ 停止</button>
            </div>
          </div>
        )}
      </div>

      {/* ===== 错误 ===== */}
      {error && <div className="ds-err"><span>⚠️ {error}</span><button onClick={() => setError(null)}>×</button></div>}

      {/* ===== 输入 ===== */}
      <ChatInput onSend={send} onAttach={handleAttach}
        streaming={streaming} providerIcon={pi.icon} />
    </div>
  );
};

// ---- 构建 API 消息（含工具定义）----
async function buildApi(plugin: DeepSeekPlugin, msgs: ChatMessage[], file: { name: string; content: string } | null, notePath: string): Promise<ChatMessage[]> {
  const out: ChatMessage[] = [];
  let sys = plugin.settings.systemPrompt?.trim() || "你是 Obsidian 知识管理助手，用中文回答。用 Markdown 格式组织回答。先给结论再展开。日常对话不要自动创建笔记。";
  sys += buildToolsPrompt();
  // Auto-inject current note content
  if (notePath) {
    const nf = plugin.app.vault.getAbstractFileByPath(notePath);
    if (nf) {
      try {
        const c = await plugin.app.vault.read(nf as any);
        sys += `\n## 当前笔记「${notePath}」\n${c.slice(0, 6000)}`;
      } catch { sys += `\n当前笔记：${notePath}`; }
    }
  }
  if (file) sys += `\n## 附件「${file.name}」（内容已加载，无需再调用 readNote）\n${file.content.slice(0, 30000)}`;
  if (plugin.settings.memoryEnabled && plugin.memory) {
    const lu = [...msgs].reverse().find(m => m.role === "user");
    if (lu) { const r = plugin.memory.retrieve(lu.content, 5); if (r.length) sys += "\n## 相关记忆\n" + r.map((m: any) => `- ${m.title}`).join("\n"); }
  }
  if (plugin.searchIndex) {
    const lu = [...msgs].reverse().find(m => m.role === "user");
    if (lu) try {
      const r = plugin.searchIndex.search(lu.content, 5);
      if (r.length) sys += "\n## Vault 相关\n" + r.map((x: any) => `- [[${x.title}]]`).join("\n");
    } catch { /* */ }
  }
  out.push({ role: "system", content: sys });
  for (const m of msgs.slice(-25)) out.push({ role: m.role, content: m.content.slice(0, 4000) });
  return out;
}
