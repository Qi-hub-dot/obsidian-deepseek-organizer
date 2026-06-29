// ============================================================
// ChatMessage.tsx — 精简消息气泡
// ============================================================
import React, { useEffect, useRef, useState } from "react";
import { MarkdownRenderer } from "obsidian";
import type { ChatMessage } from "../types";

interface Props {
  message: ChatMessage;
  index: number;
  onCopy: (content: string) => void;
  onCreateCanvas: (content: string) => void;
  onRegenerate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isEditing: boolean;
  onEditSave: (text: string) => void;
  onEditCancel: () => void;
  modelTag?: string;
}

export const ChatMessageView: React.FC<Props> = ({
  message, onCopy, onCreateCanvas, onRegenerate, onEdit, onDelete,
  isEditing, onEditSave, onEditCancel, modelTag,
}) => {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [editText, setEditText] = useState(message.content);
  const [showActions, setShowActions] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!bodyRef.current || isEditing) return;
    bodyRef.current.empty();
    const app = (window as any).app;
    if (app) MarkdownRenderer.render(app, message.content, bodyRef.current, "", app.plugins);
    else bodyRef.current.setText(message.content);
  }, [message.content, isEditing]);

  const cc = () => { onCopy(message.content); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <div className={`ds-msg-row ${message.role}`}
      onMouseEnter={() => setShowActions(true)} onMouseLeave={() => setShowActions(false)}>
      <div className="ds-msg-card">
        <div className="ds-meta">
          <span>{message.role === "user" ? "你" : "AI 助手"}</span>
          {message.role === "assistant" && modelTag && <span className="ds-meta-tag">{modelTag}</span>}
        </div>

        {isEditing ? (
          <div className="ds-edit">
            <textarea className="ds-edit-ta" value={editText} onChange={e => setEditText(e.target.value)}
              rows={Math.min(editText.split("\n").length, 12)} autoFocus />
            <div className="ds-edit-btns">
              <button className="ds-btn ds-btn-main" onClick={() => onEditSave(editText)}>保存</button>
              <button className="ds-btn" onClick={onEditCancel}>取消</button>
            </div>
          </div>
        ) : (
          <div ref={bodyRef} className="ds-body" />
        )}

        {!isEditing && message.content.trim() && (
          <div className={`ds-actions ${showActions ? "on" : ""}`}>
            {message.role === "assistant" ? <>
              <button className="ds-act" onClick={cc} title="复制">{copied ? "✓" : "📋"}</button>
              <button className="ds-act" onClick={() => onCreateCanvas(message.content)} title="生成知识图谱">🧠</button>
              <button className="ds-act" onClick={onRegenerate} title="重新生成">🔄</button>
              <button className="ds-act" onClick={onDelete} title="删除">🗑</button>
            </> : <>
              <button className="ds-act" onClick={cc} title="复制">{copied ? "✓" : "📋"}</button>
              <button className="ds-act" onClick={onEdit} title="编辑">✏️</button>
              <button className="ds-act" onClick={onDelete} title="删除">🗑</button>
            </>}
          </div>
        )}
      </div>
    </div>
  );
};
