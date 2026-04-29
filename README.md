# 🌐 HTML 文件管理器 Pro

一个基于 GitHub Pages 的在线 HTML 文件管理器，支持代码编辑、实时预览、文件上传下载等功能。

## ✨ 功能

- 📁 **文件管理** — 上传、下载、新建、删除 HTML 文件
- ✏️ **代码编辑** — CodeMirror 6 编辑器，支持语法高亮、自动补全、Emmet
- 👁 **实时预览** — 左右分屏，编辑即时预览
- 🔍 **搜索过滤** — 快速搜索文件列表
- 🌗 **深色/浅色主题** — 一键切换
- 💾 **自动草稿** — 编辑内容自动保存到本地，防止意外丢失
- 🔧 **代码格式化** — 一键格式化 HTML 代码
- 📱 **响应式布局** — 支持移动端访问

## 🚀 使用方法

### 1. 创建 GitHub Token

1. 前往 [GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens](https://github.com/settings/personal-access-tokens/new)
2. 设置 Token 名称和过期时间（建议 90 天）
3. Repository access 选择 **Only select repositories**，选择本仓库
4. Permissions → Repository permissions → **Contents** 设为 **Read and write**
5. 生成 Token 并复制

### 2. 使用 Token 连接

打开网页后，在左侧边栏顶部粘贴 Token，点击「连接」。

### 3. 管理文件

- **上传**：点击「＋ 上传」按钮，支持拖拽文件
- **新建**：点击「📝 新建」按钮
- **编辑**：选中文件后点击「✏️ 编辑」
- **预览**：选中文件后点击「👁 预览」
- **删除**：选中文件后点击「🗑 删除」，需输入文件名确认

## ⌨️ 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+S` | 保存 |
| `Ctrl+F` | 搜索 |
| `Ctrl+H` | 替换 |
| `Ctrl+D` | 选择下一个匹配 |
| `Ctrl+/` | 切换注释 |
| `Tab` | Emmet 展开 / 缩进 |
| `Ctrl+Z` | 撤销 |
| `Alt+↑/↓` | 上下移动行 |
| `Ctrl+N` | 新建文件 |
| `Esc` | 关闭弹窗/编辑器 |

## 🔒 安全说明

- Token 存储在浏览器 `localStorage` 中，仅限个人设备使用
- **强烈建议**使用 Fine-grained Token，并限制为本仓库的读写权限
- 预览 iframe 使用 `sandbox` 属性隔离，防止脚本访问主页面数据
- 不要在公共设备上保存 Token

## 📂 文件结构

```
├── index.html      # 主页面
├── style.css       # 样式表（含深色/浅色主题）
├── app.js          # 主逻辑
└── README.md       # 说明文档
```

## 🛠 技术栈

- **编辑器**：[CodeMirror 6](https://codemirror.net/)（通过 esm.sh CDN 加载）
- **Emmet**：[emmet](https://emmet.io/)（HTML 快速编写）
- **API**：GitHub REST API v3
- **部署**：GitHub Pages

## 📝 注意事项

- 文件存储在仓库的 `files/` 目录下
- 所有有 Token 的用户共享同一仓库
- GitHub API 有速率限制（未认证 60次/小时，认证 5000次/小时）
- 单个文件内容不能超过 100MB（GitHub 限制）
