# Devku Image Gen for Codex

让 Codex 主动识别并调用 Devku 图片生成服务。插件提供真实位图生成（`generate_image`）和图生图编辑（`edit_image`）两个工具，支持 `gpt-image-2` 和 `gpt-image-1.5`，结果会保存到本机并直接返回预览。

## 环境要求

- macOS 或 Windows
- Codex CLI / Codex Desktop
- Node.js 20 或更高版本
- 一枚可用的 Devku Image API Key

插件已经包含打包后的 MCP 服务，不需要在朋友的电脑上运行 `npm install`。

## 安装

安装脚本会检查运行环境、保存凭证、添加 GitHub marketplace 并安装插件。仓库更新后再次运行同一个脚本即可升级。

### macOS

```bash
git clone https://github.com/hiccup711/devku_imagegen.git
cd devku_imagegen
sh scripts/setup-macos.sh
```

API Key 会写入当前用户的 macOS Keychain，服务名为 `devku-image-mcp`。

### Windows

```powershell
git clone https://github.com/hiccup711/devku_imagegen.git
Set-Location devku_imagegen
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
```

API Key 会用 Windows DPAPI 加密，只能由当前 Windows 用户解密。加密文件默认位于 `%LOCALAPPDATA%\Devku\ImageGen\credential.dat`。

需要手动安装时，可以运行：

```bash
codex plugin marketplace add hiccup711/devku_imagegen
codex plugin add devku-imagegen@devku-imagegen
```

配置完成后重启 Codex，并新建一个任务。可以这样测试：

```text
$devku-imagegen 生成一张 1024x1024 的测试图片：纯白背景，中央一个黑色圆形，不含文字。
```

图生图：把本地图片的绝对路径告诉 Codex 即可，也可以直接接着修改上一张生成结果：

```text
$devku-imagegen 把 /Users/me/Pictures/logo.png 的背景换成纯白，主体保持不变。
```

`edit_image` 一次最多接收 16 张 PNG、JPEG 或 WebP 图片（单张不超过 20 MB，合计不超过 28 MB），可选一张带透明通道的 PNG 蒙版，透明区域为重绘区域。默认输出 `1024x1024`。图片在发送前会在本地校验格式，上传时的文件名统一为 `image-1.png` 这种形式，不会暴露本地路径。图生图会把输入图片一起计入用量。

## 凭证优先级

MCP 按以下顺序读取凭证：

1. `DEVKU_IMAGE_API_KEY` 环境变量
2. macOS Keychain
3. Windows 当前用户的 DPAPI 加密文件

`DEVKU_IMAGE_BASE_URL` 可以覆盖默认接口地址，默认值为 `https://a1.devku.ai/v1`。

## 开发

```bash
npm install
npm test
```

`npm test` 会执行类型检查、生成单文件 `server.mjs`、运行单元测试和 MCP 协议冒烟测试。

## 安全边界

- 仓库和插件包中不包含 API Key。
- API Key 不写入 Codex 配置、项目文件或日志。
- `edit_image` 只上传文件头为 PNG、JPEG 或 WebP 的本地文件，其他文件在本地就会被拒绝。
- macOS 使用系统 Keychain；Windows 使用当前用户范围的 DPAPI。
- 环境变量适合 CI 或临时测试，但不建议长期写在共享脚本中。

## 官方参考

- [OpenAI Codex Plugins](https://developers.openai.com/codex/plugins/)
- [Package your plugin](https://developers.openai.com/plugins/build/plugins)

## License

MIT
