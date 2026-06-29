// ============================================================
// ChatInput.tsx — 单个附件按钮，智能路由
// ============================================================
import React, { useState, useRef, useCallback, useEffect } from "react";

interface Props {
  onSend: (text: string) => void;
  onAttach: (file: File) => void;
  streaming: boolean;
  providerIcon: string;
}

export const ChatInput: React.FC<Props> = ({ onSend, onAttach, streaming, providerIcon }) => {
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (taRef.current) { taRef.current.style.height = "auto"; taRef.current.style.height = Math.min(taRef.current.scrollHeight, 200) + "px"; }
  }, [text]);
  useEffect(() => { taRef.current?.focus(); }, []);

  const send = useCallback(() => {
    const t = text.trim(); if (!t || streaming) return;
    onSend(t); setText("");
  }, [text, streaming, onSend]);

  return (
    <div className="ds-input-wrap">
      <div className="ds-input-box">
        <textarea
          ref={taRef}
          className="ds-input-ta"
          placeholder="输入消息...  (Enter 发送 · Shift+Enter 换行)"
          rows={3}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          disabled={streaming}
        />
      </div>

      <div className="ds-input-foot">
        <div className="ds-input-tools">
          <button className="ds-tool" onClick={() => fileRef.current?.click()} title="附加文件">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 1 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            <span className="ds-tool-label">附件</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".md,.txt,.pdf,.docx,.doc,image/*"
            hidden
            onChange={e => { const f = e.target.files?.[0]; if (f) { onAttach(f); fileRef.current!.value = ""; } }}
          />
        </div>
        <div className="ds-input-end">
          <span className="ds-input-pi">{providerIcon}</span>
          <span className="ds-input-hint">Enter 发送</span>
          {streaming ? (
            <button className="ds-send ds-send-off" onClick={() => {}} disabled>⏹ 停止</button>
          ) : (
            <button className="ds-send" onClick={send} disabled={!text.trim()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
