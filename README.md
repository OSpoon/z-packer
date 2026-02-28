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
- 🚀 **Professional UX**: Powered by `archiver`, `globby`, and `chalk` for a premium terminal experience.

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

### Options

| Option | Description |
| :--- | :--- |
| `input` | Target directory to archive (defaults to `.`) |
| `--help` | Show help information |
| `--version` | Show version number |

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
