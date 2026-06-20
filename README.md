# DeepSeek 知识库整理 — Obsidian 插件

集成 DeepSeek V4 Pro，将 AI 能力嵌入 Obsidian 工作流，实现从「文件导入 → 智能拆分 → 整理归档 → 持续维护」的完整知识管理闭环。

## 功能

| 功能 | 描述 |
|------|------|
| 💬 **AI 对话侧边栏** | 右侧常驻面板，引用当前笔记上下文，流式对话 |
| 📥 **文件导入拆分** | 导入 .md / .txt / .pdf / .docx，AI 按主题语义自动拆分为原子笔记 |
| 📝 **摘要生成** | 选中笔记一键生成摘要（简洁 / 详细 / 大纲三种风格） |
| 🏷️ **智能标签** | AI 推荐 5-10 个标签，一键写入 frontmatter |
| 🔗 **双向链接建议** | 发现笔记间隐含关联，自动建议 `[[wiki link]]` |
| ✍️ **内容润色** | 语句优化 / 精简 / 扩展 / 修正语法，对比原文 |
| 🔒 **隐私脱敏** | 发送前本地过滤手机号/身份证/邮箱/IP，规则可独立开关 |

## 安装

### 手动安装

```bash
# 1. 进入 vault 插件目录
cd /path/to/your/vault/.obsidian/plugins

# 2. 创建插件文件夹
mkdir obsidian-deepseek-organizer
cd obsidian-deepseek-organizer

# 3. 复制构建产物
cp /path/to/this/repo/main.js .
cp /path/to/this/repo/styles.css .
cp /path/to/this/repo/manifest.json .
```

4. 重启 Obsidian
5. 设置 → 社区插件 → 启用「DeepSeek 知识库整理」

### 开发构建

```bash
git clone <repo-url>
cd obsidian-deepseek
npm install
npm run dev          # 监听模式
npm run build        # 生产构建
npm test             # 单元测试
```

## 配置

### 方式一：Settings Tab（推荐）

设置 → DeepSeek 知识库整理：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| API Base URL | DeepSeek API 端点 | `https://api.deepseek.com` |
| API Key | DeepSeek API 密钥 | `sk-...` |
| 模型名称 | 模型 ID | `deepseek-chat` |
| 启用脱敏 | PII 过滤开关 | ✅ 开启 |
| 默认目标目录 | 拆分笔记存放位置 | `知识库` |

### 方式二：环境变量（优先级更高）

```bash
# macOS / Linux
export DEEPSEEK_API_KEY="sk-your-key-here"

# Windows (CMD)
set DEEPSEEK_API_KEY=sk-your-key-here

# Windows (PowerShell)
$env:DEEPSEEK_API_KEY="sk-your-key-here"
```

## 使用

### 打开对话面板

- 点击左侧 Ribbon 图标（💬）
- 或 `Ctrl/Cmd+P` → 搜索「DeepSeek 助手」

### 基本对话

在面板中输入问题即可与 AI 交流，当前笔记会自动作为上下文注入。

### 命令面板操作

| 命令 | 快捷键 |
|------|--------|
| `DeepSeek: 生成摘要` | 对当前笔记生成摘要 |
| `DeepSeek: 推荐标签` | AI 推荐 frontmatter 标签 |
| `DeepSeek: 推荐双向链接` | 发现关联笔记 |
| `DeepSeek: 润色选中文本` | 选中文本后润色 |
| `DeepSeek: 导入文件并拆分` | 导入外部文件并按主题拆分 |

### 文件导入流程

1. 点击侧边栏「导入文件」或执行命令
2. 选择 .md / .txt / .pdf / .docx 文件
3. AI 自动解析文件内容并按主题拆分为独立笔记
4. 预览拆分结果，可编辑标题、标签、目标目录
5. 确认后笔记自动写入 Vault，附带完整 frontmatter 元数据

## 隐私声明

本插件在发送笔记内容到 DeepSeek API 前，会进行本地脱敏处理：

- 默认过滤：手机号 → `[手机号]`、身份证号 → `[身份证号]`、邮箱 → `[邮箱]`、IP 地址 → `[IP地址]`
- 脱敏规则可在设置中独立开关
- 脱敏完全在本地执行，不经过任何第三方服务
- API 调用通过 HTTPS 加密传输
- 脱敏后的内容发送至 DeepSeek API，请参阅 [DeepSeek 隐私政策](https://platform.deepseek.com/privacy)

## 技术架构

```
TypeScript + esbuild (bundle)
├── main.ts          插件入口 (Plugin 生命周期)
├── src/
│   ├── api.ts       DeepSeekClient (fetch + SSE 流式)
│   ├── sidebar.ts   ItemView 侧边栏
│   ├── pipeline.ts  统一处理流水线
│   ├── sanitizer.ts PII 脱敏引擎
│   ├── prompts.ts   各场景 Prompt 模板
│   ├── response-parser.ts  AI 响应结构化解析
│   ├── parsers/     文件解析器 (md/txt/pdf/docx)
│   └── ui/          UI 组件 (聊天/预览/建议列表)
└── styles.css       vanilla CSS (无框架依赖)
```

## 依赖

| 依赖 | 用途 |
|------|------|
| `obsidian` | Plugin API 类型 |
| `pdfjs-dist` | PDF 文本提取 |
| `mammoth` | DOCX 文本提取 |

无 React/Svelte 等 UI 框架依赖，保持最小 bundle 体积。

## 开发

```bash
npm test               # 运行单元测试
npm run test:integration  # 运行集成测试
npm run build          # 生产构建 → main.js
```

### 项目结构

```
obsidian-deepseek/
├── manifest.json
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── jest.config.js
├── styles.css
├── main.ts
└── src/
    ├── types.ts
    ├── settings.ts
    ├── api.ts
    ├── api.test.ts
    ├── sidebar.ts
    ├── commands.ts
    ├── pipeline.ts
    ├── pipeline.test.ts
    ├── sanitizer.ts
    ├── sanitizer.test.ts
    ├── prompts.ts
    ├── prompts.test.ts
    ├── response-parser.ts
    ├── response-parser.test.ts
    ├── __mocks__/obsidian.ts
    ├── parsers/
    │   ├── index.ts
    │   ├── index.test.ts
    │   ├── markdown.ts
    │   ├── text.ts
    │   ├── pdf.ts
    │   └── docx.ts
    └── ui/
        ├── chat-view.ts
        ├── preview-modal.ts
        └── suggestion-list.ts
```

## 许可证

MIT
