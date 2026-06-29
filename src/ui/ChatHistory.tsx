// ============================================================
// ChatHistory.tsx — 聊天历史浏览器
// ============================================================
import React, { useState, useMemo } from "react";
import type { App } from "obsidian";

interface HistoryItem {
  id: string;
  title: string;
  date: string;
}

interface Props {
  items: HistoryItem[];
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export const ChatHistory: React.FC<Props> = ({ items, onLoad, onDelete, onClose }) => {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((i) => i.title.toLowerCase().includes(q));
  }, [items, search]);

  // Group by time
  const grouped = useMemo(() => {
    const now = new Date();
    const today: HistoryItem[] = [];
    const yesterday: HistoryItem[] = [];
    const thisWeek: HistoryItem[] = [];
    const older: HistoryItem[] = [];

    for (const item of filtered) {
      const d = new Date(item.date);
      const diffDays = Math.floor(
        (now.getTime() - d.getTime()) / 86400000,
      );
      if (diffDays === 0) today.push(item);
      else if (diffDays === 1) yesterday.push(item);
      else if (diffDays < 7) thisWeek.push(item);
      else older.push(item);
    }

    const groups: Array<{ label: string; items: HistoryItem[] }> = [];
    if (today.length) groups.push({ label: "今天", items: today });
    if (yesterday.length) groups.push({ label: "昨天", items: yesterday });
    if (thisWeek.length)
      groups.push({ label: "本周", items: thisWeek });
    if (older.length) groups.push({ label: "更早", items: older });
    return groups;
  }, [filtered]);

  return (
    <div>
      <input
        className="ds-hist-search"
        placeholder="搜索对话..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
      />
      {grouped.length === 0 ? (
        <div className="ds-hist-empty">暂无对话记录</div>
      ) : (
        grouped.map((g) => (
          <div key={g.label}>
            <div className="ds-hist-group">{g.label}</div>
            {g.items.map((item) => (
              <div key={item.id} className="ds-hist-item">
                <span
                  className="ds-hist-item-title"
                  onClick={() => {
                    onLoad(item.id);
                    onClose();
                  }}
                  style={{ cursor: "pointer" }}
                >
                  {item.title}
                </span>
                <button
                  className="ds-hist-item-del"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item.id);
                  }}
                  title="删除"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
};
