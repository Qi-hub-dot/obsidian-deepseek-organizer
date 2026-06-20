# 贡献指南

欢迎为 DeepSeek 知识库整理插件贡献代码！

## 环境准备

```bash
git clone https://github.com/Qi/obsidian-deepseek-organizer.git
cd obsidian-deepseek-organizer
npm install
```

需要 Node.js >= 20。

## 开发

```bash
npm run dev    # 监听模式，修改代码后自动构建到 main.js
```

构建产物 `main.js` 会自动生成在项目根目录。将此文件连同 `styles.css` 和 `manifest.json` 复制到测试 vault 的 `.obsidian/plugins/obsidian-deepseek-organizer/` 即可在 Obsidian 中调试。

## 项目结构

```
├── main.ts              # 插件入口
├── src/
│   ├── api.ts           # DeepSeek API 客户端
│   ├── sidebar.ts       # 侧边栏视图
│   ├── pipeline.ts      # 数据处理流水线
│   ├── sanitizer.ts     # PII 脱敏
│   ├── prompts.ts       # Prompt 模板
│   ├── response-parser.ts  # AI 响应解析
│   ├── commands.ts      # 命令面板
│   ├── parsers/         # 文件解析器 (md/txt/pdf/docx)
│   └── ui/              # UI 组件
└── styles.css           # 样式
```

## 提交规范

- commit message 使用中文或英文均可，请清晰描述改动
- 新功能请附带测试
- PR 提交前请确保 `npm run build` 通过

## 发布流程

1. 更新 `manifest.json` 和 `package.json` 中的版本号
2. 打 tag：`git tag v1.x.x`
3. push tag：`git push origin v1.x.x`
4. GitHub Actions 自动构建并创建 Release
