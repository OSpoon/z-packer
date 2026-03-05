# z-packer

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![License][license-src]][license-href]

Pack your project into zip / tar / tar.gz, gitignore-aware, deploy-ready.

## Features

- 🗜️ **Multi-format** — `zip`, `tar`, `tar.gz` via `--format`
- 🔍 **Gitignore-aware** — respects `.gitignore` rules automatically
- 🛡️ **Safe** — never includes the archive itself in the archive
- 📊 **Visual** — progress bar + file summary table
- 🚀 **Deploy** — compress & upload in one command via SSH/SFTP

## Usage

You can run `z-packer` directly without installation using `npx`:

```bash
npx z-packer [directory]
```

Or install it globally:

```bash
pnpm add -g z-packer
# then
z-packer .
```

---

## Model Context Protocol (MCP)

`z-packer` provides an official MCP Server, allowing LLMs (like Claude) to pack and deploy your project directly.

### Usage with Claude Desktop / LM Studio

Add this to your MCP client config:

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
> If you have `z-packer` installed globally, you can also use `"command": "z-packer", "args": ["mcp"]` for faster startup.

Available tools:
- `z_packer_pack`: Compress the project.
- `z_packer_deploy`: Compress and upload via SSH.
- `z_packer_get_config`: Read `.zpackerrc` settings.

---

## Configuration

To avoid typing SSH credentials on every `deploy` run, create a `.zpackerrc` file in your project directory (or `~/.zpackerrc` as a global default).

```ini
# .zpackerrc — key=value format, # lines are comments

host=192.168.1.100
port=22
username=deploy
password=secret
# or use a private key instead of password:
# privateKey=~/.ssh/id_rsa

remotePath=/home/deploy/releases
format=tar.gz
keepLocal=false
readyTimeout=20000
```

**Lookup order** (first found wins):

1. Path given by `--config`
2. `.zpackerrc` in the current directory
3. `~/.zpackerrc` in your home directory

> [!IMPORTANT]
> CLI arguments always override values from the config file.
> Add `.zpackerrc` to `.gitignore` to keep credentials out of version control.

| Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `host` | string | — | Remote server hostname or IP |
| `port` | number | `22` | SSH port |
| `username` | string | — | SSH login username |
| `password` | string | — | SSH password |
| `privateKey` | string | — | Path to SSH private key file (supports `~`) |
| `remotePath` | string | `/tmp` | Remote directory to upload the archive into |
| `format` | string | `zip` | Archive format: `zip` \| `tar` \| `tar.gz` |
| `keepLocal` | boolean | `false` | Keep the local archive after a successful upload |
| `readyTimeout` | number | `20000` | SSH connection ready timeout (ms) |

---

### `pack` — Compress only (default)


```bash
z-packer [directory]
# or explicitly
z-packer pack [directory]

# Produce a tar.gz instead of zip
z-packer pack . --format tar.gz
```

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `input` | string | `.` | Target directory to archive |
| `--format` | string | `zip` | Archive format: `zip` \| `tar` \| `tar.gz` |
| `--help` | — | — | Show help information |
| `--version` | — | — | Show version number |

---

### `deploy` — Compress then upload via SSH/SFTP

Compress the project **and** upload the resulting archive to a remote server in one step.

```bash
# Password authentication (upload to /tmp by default)
z-packer deploy . --host <server> --username <user> --password <pass>

# Upload a tar.gz instead of zip
z-packer deploy . --host <server> --username <user> --password <pass> --format tar.gz

# Private key authentication, custom remote path, keep local archive
z-packer deploy . \
  --host <server> \
  --username <user> \
  --private-key ~/.ssh/id_rsa \
  --remote-path /home/deploy/releases \
  --format tar.gz \
  --keep-local
```

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `input` | string | `.` | Project directory to compress |
| `--format` | string | `zip` | Archive format: `zip` \| `tar` \| `tar.gz` |
| `--host` | string | — | Remote server hostname or IP (**required**) |
| `--port` | number | `22` | SSH port |
| `--username` | string | — | SSH login username (**required**) |
| `--password` | string | — | Password authentication |
| `--private-key` | string | — | Path to SSH private key file (e.g. `~/.ssh/id_rsa`) |
| `--remote-path` | string | `/tmp` | Remote directory to upload the archive into |
| `--keep-local` | boolean | `false` | Keep the local archive after a successful upload |
| `--ready-timeout` | number | `20000` | SSH connection ready timeout in milliseconds |

> [!NOTE]
> Either `--password` or `--private-key` must be provided.
> After upload the local archive is deleted automatically unless `--keep-local` is set.

---

## Development

```bash
# Install dependencies
pnpm install

# Build the project
pnpm run build

# Run in development
pnpm start pack .
```

## License

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
