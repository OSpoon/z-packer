# z-packer

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![License][license-src]][license-href]

A CLI tool to compress code projects while strictly respecting your `.gitignore`.

## Features

- 🛠️ **Universal Support**: Works for any Git-managed project (Node.js, Python, Rust, C++, Go, etc.).
- 🔍 **Strict Filtering**: Automatically reads and follows `.gitignore` rules in the root and subdirectories.
- 🛡️ **Recursion Prevention**: Intelligently excludes the archive being generated while preserving other existing zip files.
- 📦 **Clean Archive**: Only packages necessary source files, excluding build artifacts and dependencies.
- 📊 **Visual Feedback**: Real-time progress bar and a detailed file summary table.
- 🚀 **SSH Deploy**: Compress and upload to a remote server in a single command via SSH/SFTP.

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

### `pack` — Compress only (default)

```bash
z-packer [directory]
# or explicitly
z-packer pack [directory]
```

| Option | Description |
| :--- | :--- |
| `input` | Target directory to archive (defaults to `.`) |
| `--help` | Show help information |
| `--version` | Show version number |

---

### `deploy` — Compress then upload via SSH/SFTP

Compress the project **and** upload the resulting archive to a remote server in one step.

```bash
# Password authentication (upload to /tmp by default)
z-packer deploy . --host <server> --username <user> --password <pass>

# Private key authentication, custom remote path, keep local archive
z-packer deploy . \
  --host <server> \
  --username <user> \
  --private-key ~/.ssh/id_rsa \
  --remote-path /home/deploy/releases \
  --keep-local
```

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `input` | string | `.` | Project directory to compress |
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
> After upload the local `.zip` is deleted automatically unless `--keep-local` is set.

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
