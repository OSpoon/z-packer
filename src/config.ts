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
  keepLocal?: boolean
  readyTimeout?: number
  format?: 'zip' | 'tar' | 'tar.gz'
}

const CONFIG_FILE = '.zpackerrc'

function expandTilde(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return p.replace('~', homedir())
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
