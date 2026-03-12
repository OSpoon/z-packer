import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'

export interface ZPackerConfig {
  host?: string
  port?: number
  username?: string
  password?: string
  /** Path to SSH private key file, supports ~ expansion */
  privateKey?: string
  remotePath?: string
  /** Additional remote command(s) to run after deploy */
  postCommands?: string
  /** Local script path(s) to upload and execute on the remote server */
  postScripts?: string
  keepLocal?: boolean
  readyTimeout?: number
  format?: 'zip' | 'tar' | 'tar.gz'
}

const CONFIG_FILE = '.zpackerrc'

function expandTilde(p: string): string {
  if (p.startsWith('~/')) {
    return join(homedir(), p.slice(2))
  }
  if (p === '~') {
    return homedir()
  }
  return p
}

/**
 * Parse a `.zpackerrc` file in key=value format (like .npmrc).
 *
 * Rules:
 * - Lines starting with `#` are comments and are ignored.
 * - Empty lines are ignored.
 * - Each valid line must be `key=value` (extra whitespace is trimmed).
 */
function parseKeyValue(content: string, filePath: string): Record<string, string> {
  const result: Record<string, string> = {}

  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#'))
      continue

    const eqIdx = line.indexOf('=')
    if (eqIdx === -1) {
      throw new Error(`Invalid line in config file "${filePath}": "${line}" (expected key=value)`)
    }

    const key = line.slice(0, eqIdx).trim()
    const value = line.slice(eqIdx + 1).trim()
    if (!key) {
      throw new Error(`Empty key in config file "${filePath}": "${line}"`)
    }
    result[key] = value
  }

  return result
}

/**
 * Cast raw string values to the correct types for ZPackerConfig.
 */
function castConfig(raw: Record<string, string>, filePath: string): ZPackerConfig {
  const config: ZPackerConfig = {}

  const knownKeys = new Set([
    'host',
    'port',
    'username',
    'password',
    'privateKey',
    'remotePath',
    'postCommands',
    'postScripts',
    'keepLocal',
    'readyTimeout',
    'format',
  ])

  for (const [key, value] of Object.entries(raw)) {
    if (!knownKeys.has(key)) {
      // Silently ignore unknown keys (forward-compatible)
      continue
    }

    switch (key as keyof ZPackerConfig) {
      case 'port':
      case 'readyTimeout': {
        const n = Number(value)
        if (Number.isNaN(n)) {
          throw new TypeError(`Invalid number for "${key}" in "${filePath}": "${value}"`)
        }
        ;(config as any)[key] = n
        break
      }
      case 'keepLocal':
        (config as any)[key] = value === 'true'
        break
      case 'format': {
        const allowed = ['zip', 'tar', 'tar.gz']
        if (!allowed.includes(value)) {
          throw new Error(`Invalid format "${value}" in "${filePath}". Allowed: ${allowed.join(', ')}`)
        }
        config.format = value as ZPackerConfig['format']
        break
      }
      case 'privateKey':
        config.privateKey = expandTilde(value)
        break
      default:
        ;(config as any)[key] = value
    }
  }

  return config
}

/**
 * Load `.zpackerrc` config file.
 *
 * Lookup order:
 * 1. `customPath` (when --config is provided)
 * 2. Current working directory (.zpackerrc)
 * 3. User home directory (~/.zpackerrc)
 *
 * CLI arguments always override config file values.
 */
export function loadConfig(customPath?: string, cwd: string = process.cwd()): ZPackerConfig {
  const candidates = customPath
    ? [resolve(customPath)]
    : [join(cwd, CONFIG_FILE), join(homedir(), CONFIG_FILE)]

  for (const filePath of candidates) {
    if (!existsSync(filePath))
      continue

    let raw: string
    try {
      raw = readFileSync(filePath, 'utf-8')
    }
    catch (err) {
      throw new Error(`Failed to read config file "${filePath}": ${(err as Error).message}`)
    }

    const kvMap = parseKeyValue(raw, filePath)
    return castConfig(kvMap, filePath)
  }

  return {}
}

/**
 * Generate a `.zpackerrc` template string with all known keys and helpful comments.
 */
export function generateConfigTemplate(): string {
  return [
    '# .zpackerrc — z-packer configuration file',
    '# Key=value format. Lines starting with # are comments.',
    '# CLI arguments always override values set here.',
    '# Add this file to .gitignore to keep credentials out of version control.',
    '',
    '# Remote server hostname or IP',
    '# host=192.168.1.100',
    '',
    '# SSH port (default: 22)',
    '# port=22',
    '',
    '# SSH login username',
    '# username=deploy',
    '',
    '# SSH password (use privateKey for key-based auth)',
    '# password=secret',
    '',
    '# Path to SSH private key file (supports ~)',
    '# privateKey=~/.ssh/id_rsa',
    '',
    '# Remote directory to upload the archive into (default: /tmp)',
    '# remotePath=/home/deploy/releases',
    '',
    '# Additional remote command(s) after deploy (supports {{remoteFile}}, {{remoteDir}})',
    '# postCommands=rm -f {{remoteFile}}',
    '',
    '# Local script path(s) to upload and execute (comma-separated if multiple)',
    '# postScripts=./deploy.sh,./restart.sh',
    '',
    '# Archive format: zip | tar | tar.gz (default: zip)',
    '# format=tar.gz',
    '',
    '# Keep the local archive after a successful upload (default: false)',
    '# keepLocal=false',
    '',
    '# SSH connection ready timeout in milliseconds (default: 20000)',
    '# readyTimeout=20000',
    '',
  ].join('\n')
}
