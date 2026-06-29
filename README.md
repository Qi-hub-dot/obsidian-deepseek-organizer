# AI 助手 — Obsidian 插件

国产大模型 AI 助手，支持 **DeepSeek / 通义千问 / 智谱 GLM / Ollama**，具备工具调用、多模态识别、Vault 语义检索等能力。

## ✨ 功能

### 🤖 多模型支持
| 模型 | 特点 |
|------|------|
| 🔴 DeepSeek V4 Flash / Pro | 默认，快速 + 深度推理 |
| 🟠 通义千问 (Qwen) | 阿里云，OpenAI 兼容 |
| 🔵 智谱 GLM-4 | 清华，OpenAI 兼容 |
| 🦙 Ollama 本地 | 支持 qwen2.5 等本地模型 |

### 🔧 AI 工具调用
AI 可**自主执行操作**，无需手动操作：

| 工具 | 功能 |
|------|------|
| `searchVault` | 搜索 Vault 中相关笔记 |
| `readNote` | 读取指定笔记全文 |
| `createNote` | 创建新笔记（自动分类目录） |
| `appendNote` | 追加内容到已有笔记 |
| `getFileTree` | 浏览目录结构 |
| `getTags` | 查看所有标签 |
| `getCurrentTime` | 获取当前时间 |

> 工作流：用户提问 → AI 判断是否需要工具 → 调用工具获取结果 → 基于结果回答。最多 20 轮，连续 2 轮无工具调用自动结束。

### 📷 多模态文件识别
统一的「附件」按钮，自动判断文件类型：

| 文件类型 | 处理方式 |
|----------|---------|
| 图片 (png/jpg/gif/webp) | 视觉模型识别 → 注入上下文 |
| PDF (含扫描件) | 渲染首页 → 视觉模型提取文字 |
| Word (docx) | mammoth 提取文字 |
| Markdown/TXT | 直接解析 → 注入上下文 |

> 视觉模型独立配置，支持**通义千问 VL** / **智谱 GLM-4V**。

### 🔍 Vault 语义检索 (RAG)
- 本地 TF-IDF 全文索引，**无需外部嵌入服务**
- 每次对话自动检索 Top-5 相关笔记注入上下文
- 搜索结果标注 🟢高相关 / 🟡低相关，AI 自行判断是否采用

### 💬 对话体验
- 流式输出 + 三点跳动加载
- **思考面板**：V4 Pro 推理过程可折叠展示
- 消息操作：复制 / 知识图谱 / 重新生成 / 编辑 / 删除（悬停显示）
- 模型一键切换，顶栏实时同步图标和标签
- Token 估算 + 上下文标签栏

### 📝 智能笔记生成
- 说「生成笔记」→ AI 先搜索 Vault → 关联 [[已有笔记]] → 自动创建
- 路径按内容自动分类（如 `编程/Python.md`、`学习/线性代数.md`）
- 带 frontmatter（title/date/tags）+ 双向链接

### 🧠 知识图谱
- 对笔记/AI 回答生成 Canvas 思维导图
- 自动节点布局 + 颜色编码

### ⚡ 快捷操作
- 编辑器选中文本 → 内联润色 / 解释 / 翻译
- 6 组快捷提示，一键发送
- 自定义 System Prompt
- 一键导出对话为 Markdown

### 🔒 隐私
- 本地 PII 脱敏（手机号/身份证/邮箱/IP）
- 记忆缓存自动 LRU 清理

## 📦 安装

```bash
# 1. 下载 Release 中的 main.js / styles.css / manifest.json
# 2. 放入 vault 的 .obsidian/plugins/obsidian-deepseek-organizer/
# 3. 重启 Obsidian → 设置 → 启用「AI 助手」
```

## ⚙️ 配置

| 配置项 | 说明 |
|--------|------|
| 🔴 DeepSeek | API Key + 模型选择 (Flash/Pro) + 推理强度 |
| 🟠 通义千问 | API Key + Base URL + 模型 (qwen-plus/max) |
| 🔵 智谱 GLM | API Key + Base URL + 模型 (glm-4-flash/plus) |
| 🦙 Ollama | Base URL + 本地模型名 |
| 📷 多模态 | 视觉提供商 (通义千问 VL / GLM-4V) + API Key + 模型 |
| 💬 System Prompt | 自定义 AI 行为指令（支持变量） |
| 🔒 脱敏 | 独立开关各 PII 规则 |
| 🧠 记忆 | 文件夹 + 容量限制 |

## 🛠 开发

```bash
git clone https://github.com/Qi-hub-dot/obsidian-ai-assistant.git
cd obsidian-ai-assistant
npm install
npm run dev    # 监听模式
npm run build  # 生产构建 → main.js
```

## 📄 许可证

MIT
