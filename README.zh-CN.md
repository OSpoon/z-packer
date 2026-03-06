# z-packer

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![License][license-src]][license-href]

将你的项目打包为 zip / tar / tar.gz，自动遵守 .gitignore 规则，随时可部署。

## 功能特性

- 🗜️ **多格式** — 支持 `zip`、`tar`、`tar.gz`，通过 `--format` 指定
- 🔍 **遵守 gitignore** — 自动读取 `.gitignore` 规则，无需手动排除
- 🛡️ **安全** — 打包时自动排除生成的压缩包本身，不会重复打包
- 📊 **可视化** — 字节级进度条 + 文件清单表格
- 🚀 **一键部署** — 打包并通过 SSH/SFTP 上传，一条命令完成
- 🔎 **预览模式** — 使用 `--dry-run` 预览打包文件清单，不实际压缩
- ⚙️ **初始化** — 使用 `init` 命令快速生成 `.zpackerrc` 配置模板

## 使用方式

无需安装，通过 `npx` 直接运行：

```bash
npx z-packer [目录]
```

或全局安装后使用：

```bash
pnpm add -g z-packer
# 然后
z-packer .
```

---

## Model Context Protocol (MCP)

`z-packer` 提供官方 MCP Server，让 LLM（如 Claude）可以直接调用打包和部署功能。

### 接入 Claude Desktop / LM Studio

在 MCP 客户端配置文件中添加：

```json
{
  "mcpServers": {
    "z-packer": {
      "command": "npx",
      "args": ["-y", "z-packer", "mcp"]
    }
  }
}
```

> [!TIP]
> 如果已全局安装 `z-packer`，也可以使用 `"command": "z-packer", "args": ["mcp"]` 以获得更快的启动速度。

可用工具：

- `z_packer_get_config`：读取 `.zpackerrc` 配置。建议首先调用以获取预设的 SSH 凭证。
- `z_packer_scan`：预览将被打包的文件清单（等同于 `--dry-run`）。
- `z_packer_init`：在目标目录生成 `.zpackerrc` 配置模板。
- `z_packer_pack`：将项目压缩为 `zip`、`tar` 或 `tar.gz` 格式。
- `z_packer_deploy`：一键完成压缩并通 SSH/SFTP 上传。需要 host、username 以及认证信息（密码或私钥）。

### 调试 MCP

如果 MCP Server 运行异常，请参考以下步骤：

1. **使用 MCP Inspector**：官方交互式调试工具。
   ```bash
   npx @modelcontextprotocol/inspector npx -y z-packer mcp
   ```
2. **查看日志**：
   - MCP 使用 `stdout` 进行通信，**绝对不要用 `console.log`** 输出调试信息。
   - 使用 **`console.error`**，输出内容会出现在客户端的错误日志中（如 Claude Desktop 的日志面板）。
3. **本地验证**：
   在终端运行 `z-packer mcp`，应看到 `[z-packer] MCP script loading...` 和 `z-packer MCP server running on stdio`，之后服务进入等待状态（接收 JSON-RPC 输入）。

---

## 配置文件

为避免每次 `deploy` 都要输入 SSH 凭证，可以在项目目录（或 `~/.zpackerrc` 作为全局默认）创建 `.zpackerrc` 文件：

```ini
# .zpackerrc — key=value 格式，# 开头为注释

host=192.168.1.100
port=22
username=deploy
password=secret
# 或使用私钥代替密码：
# privateKey=~/.ssh/id_rsa

remotePath=/home/deploy/releases
format=tar.gz
keepLocal=false
readyTimeout=20000
```

**查找顺序**（先找到先生效）：

1. `--config` 指定的路径
2. 当前目录的 `.zpackerrc`
3. 用户主目录的 `~/.zpackerrc`

> [!IMPORTANT]
> CLI 命令行参数的优先级始终高于配置文件。
> 请将 `.zpackerrc` 加入 `.gitignore`，避免将凭证提交到版本库。

| 配置项 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `host` | string | — | 远程服务器地址或 IP |
| `port` | number | `22` | SSH 端口 |
| `username` | string | — | SSH 登录用户名 |
| `password` | string | — | SSH 登录密码 |
| `privateKey` | string | — | SSH 私钥文件路径（支持 `~` 展开） |
| `remotePath` | string | `/tmp` | 远程服务器上的目标目录 |
| `format` | string | `zip` | 压缩格式：`zip` \| `tar` \| `tar.gz` |
| `keepLocal` | boolean | `false` | 上传成功后是否保留本地压缩包 |
| `readyTimeout` | number | `20000` | SSH 连接超时时间（毫秒） |

---

### `init` — 生成配置模板

在当前目录创建 `.zpackerrc` 模板文件：

```bash
z-packer init

# 覆盖已有的 .zpackerrc
z-packer init --force
```

| 参数 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `--force` | boolean | `false` | 覆盖已有的 `.zpackerrc` 文件 |

---

### `pack` — 仅压缩（默认命令）

```bash
z-packer [目录]
# 或显式使用 pack 子命令
z-packer pack [目录]

# 生成 tar.gz 格式
z-packer pack . --format tar.gz

# 预览打包文件清单（不实际创建压缩包）
z-packer pack . --dry-run
```

| 参数 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `input` | string | `.` | 要打包的目标目录 |
| `--format` | string | `zip` | 压缩格式：`zip` \| `tar` \| `tar.gz` |
| `--dry-run` | boolean | `false` | 预览将被打包的文件清单，不实际创建压缩包 |
| `--help` | — | — | 显示帮助 |
| `--version` | — | — | 显示版本号 |

---

### `deploy` — 压缩并通过 SSH/SFTP 上传

一条命令完成"压缩项目 + 上传到远程服务器"。

```bash
# 密码认证（默认上传到 /tmp）
z-packer deploy . --host <服务器> --username <用户> --password <密码>

# 生成 tar.gz 格式并上传
z-packer deploy . --host <服务器> --username <用户> --password <密码> --format tar.gz

# 私钥认证，自定义远程路径，保留本地压缩包
z-packer deploy . \
  --host <服务器> \
  --username <用户> \
  --private-key ~/.ssh/id_rsa \
  --remote-path /home/deploy/releases \
  --format tar.gz \
  --keep-local
```

| 参数 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `input` | string | `.` | 要压缩的项目目录 |
| `--format` | string | `zip` | 压缩格式：`zip` \| `tar` \| `tar.gz` |
| `--host` | string | — | 远程服务器地址（**必填**） |
| `--port` | number | `22` | SSH 端口 |
| `--username` | string | — | SSH 用户名（**必填**） |
| `--password` | string | — | 密码认证 |
| `--private-key` | string | — | SSH 私钥文件路径（如 `~/.ssh/id_rsa`） |
| `--remote-path` | string | `/tmp` | 上传到远程服务器的目标目录 |
| `--keep-local` | boolean | `false` | 上传后保留本地压缩包 |
| `--ready-timeout` | number | `20000` | SSH 连接超时时间（毫秒） |

> [!NOTE]
> `--password` 和 `--private-key` 必须提供其中一个。
> 上传完成后，本地压缩包默认自动删除，除非设置了 `--keep-local`。
> 如果缺少 `--host`、`--username` 或认证信息，z-packer 将交互式提示你填写所需字段。

---

## 开发

```bash
# 安装依赖
pnpm install

# 构建项目
pnpm run build

# 开发模式运行
pnpm start pack .
```

## 许可证

[MIT](./LICENSE) License © 2024-PRESENT [OSpoon](https://github.com/OSpoon)

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/z-packer?style=flat&colorA=080f12&colorB=1fa669
[npm-version-href]: https://npmjs.com/package/z-packer
[npm-downloads-src]: https://img.shields.io/npm/dm/z-packer?style=flat&colorA=080f12&colorB=1fa669
[npm-downloads-href]: https://npmjs.com/package/z-packer
[bundle-src]: https://img.shields.io/bundlephobia/minzip/z-packer?style=flat&colorA=080f12&colorB=1fa669&label=minzip
[bundle-href]: https://bundlephobia.com/result?p=z-packer
[license-src]: https://img.shields.io/github/license/OSpoon/z-packer.svg?style=flat&colorA=080f12&colorB=1fa669
[license-href]: https://github.com/OSpoon/z-packer/blob/main/LICENSE
