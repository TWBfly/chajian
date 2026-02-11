# Gemini 回复下载器

这是一个 Chrome 浏览器扩展插件，用于下载 Gemini 页面中 `model-response` 元素的纯文字内容，并保存为 Markdown 文件。

## 功能特点

- ✨ **下载最新回复**：仅下载页面上最新的一条 Gemini 回复
- 📦 **下载全部回复**：下载当前对话中的所有 Gemini 回复
- 🎨 **美观界面**：现代化的弹窗界面设计
- 📝 **Markdown 格式**：自动格式化为 Markdown 文件，便于阅读和编辑

## 安装步骤

1. 打开 Chrome 浏览器，进入 `chrome://extensions/`
2. 开启右上角的「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `gemini_answer_download` 文件夹
5. 扩展安装完成！

## 使用方法

1. 打开 [Gemini](https://gemini.google.com/) 网站
2. 与 Gemini 进行对话
3. 点击浏览器工具栏中的扩展图标
4. 可选：修改文件名
5. 点击「下载最新回复」或「下载全部回复」按钮
6. 选择保存位置，文件将以 `.md` 格式保存

## 文件结构

```
gemini_answer_download/
├── manifest.json      # 扩展配置文件
├── content.js         # 内容脚本（提取页面内容）
├── popup.html         # 弹窗界面
├── popup.js           # 弹窗逻辑
├── icon16.png         # 16x16 图标
├── icon48.png         # 48x48 图标
├── icon128.png        # 128x128 图标
├── create_icons.py    # 图标生成脚本
└── README.md          # 说明文档
```

## 技术说明

该插件通过以下方式提取 Gemini 回复的纯文字内容：

1. Content Script 注入到 Gemini 页面
2. 使用 `document.querySelectorAll('model-response')` 查找所有回复元素
3. 通过 `innerText` 属性获取纯文字内容（自动去除 HTML 标签）
4. 将内容格式化为 Markdown 并触发下载

## 注意事项

- 此插件仅适用于 `gemini.google.com` 网站
- 下载的内容为纯文字，不包含图片等媒体内容
- 如果页面状态显示「连接失败」，请刷新 Gemini 页面后重试
