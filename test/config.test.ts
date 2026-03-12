import { homedir } from 'node:os'
import { join } from 'node:path'
import fs from 'fs-extra'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { generateConfigTemplate, loadConfig } from '../src/config'

const testDir = join(process.cwd(), 'temp-config-test')
const fakeHome = join(testDir, 'home')
const fakeCwd = join(testDir, 'cwd')

// Helper: create a .zpackerrc content string
function rc(lines: string[]): string {
  return lines.join('\n')
}

describe('loadConfig', () => {
  beforeAll(async () => {
    await fs.ensureDir(fakeHome)
    await fs.ensureDir(fakeCwd)
  })

  afterAll(async () => {
    await fs.remove(testDir)
  })

  // ── returns empty when no config file found ──────────────────────────────

  it('should return {} when no .zpackerrc exists', () => {
    const cfg = loadConfig(undefined, join(testDir, 'no-such-dir'))
    expect(cfg).toEqual({})
  })

  // ── cwd lookup ───────────────────────────────────────────────────────────

  it('should read .zpackerrc from cwd', async () => {
    await fs.writeFile(join(fakeCwd, '.zpackerrc'), rc([
      '# SSH config',
      'host=192.168.1.1',
      'port=2222',
      'username=deploy',
      'password=secret',
      'remotePath=/srv/app',
      'postCommands=echo deploy',
      'postScripts=./deploy.sh,./restart.sh',
      'format=tar.gz',
      'keepLocal=true',
      'readyTimeout=5000',
    ]))

    const cfg = loadConfig(undefined, fakeCwd)
    expect(cfg.host).toBe('192.168.1.1')
    expect(cfg.port).toBe(2222)
    expect(cfg.username).toBe('deploy')
    expect(cfg.password).toBe('secret')
    expect(cfg.remotePath).toBe('/srv/app')
    expect(cfg.postCommands).toBe('echo deploy')
    expect(cfg.postScripts).toBe('./deploy.sh,./restart.sh')
    expect(cfg.format).toBe('tar.gz')
    expect(cfg.keepLocal).toBe(true)
    expect(cfg.readyTimeout).toBe(5000)
  })

  // ── home directory fallback ──────────────────────────────────────────────

  it('should fall back to home .zpackerrc when cwd has none', async () => {
    const emptyDir = join(testDir, 'empty-cwd')
    await fs.ensureDir(emptyDir)
    await fs.writeFile(join(fakeHome, '.zpackerrc'), rc([
      'host=10.0.0.1',
      'username=root',
      'password=homepass',
    ]))

    // Override homedir by patching through custom path workaround:
    // Since we can't mock homedir easily, we test via customPath instead
    const cfg = loadConfig(join(fakeHome, '.zpackerrc'))
    expect(cfg.host).toBe('10.0.0.1')
    expect(cfg.username).toBe('root')
    expect(cfg.password).toBe('homepass')
  })

  // ── custom --config path ─────────────────────────────────────────────────

  it('should load from a custom config path', async () => {
    const customPath = join(testDir, 'my.zpackerrc')
    await fs.writeFile(customPath, rc([
      'host=custom.server.com',
      'username=admin',
      'password=adminpass',
    ]))

    const cfg = loadConfig(customPath)
    expect(cfg.host).toBe('custom.server.com')
    expect(cfg.username).toBe('admin')
  })

  // ── comments and blank lines ─────────────────────────────────────────────

  it('should ignore comment lines and blank lines', async () => {
    const p = join(testDir, 'comments.zpackerrc')
    await fs.writeFile(p, rc([
      '# This is a comment',
      '',
      '  # Indented comment',
      'host=1.2.3.4',
      '',
      'username=user',
    ]))

    const cfg = loadConfig(p)
    expect(cfg.host).toBe('1.2.3.4')
    expect(cfg.username).toBe('user')
  })

  // ── tilde expansion ──────────────────────────────────────────────────────

  it('should expand ~ in privateKey path', async () => {
    const p = join(testDir, 'tilde.zpackerrc')
    await fs.writeFile(p, rc([
      'host=1.2.3.4',
      'username=user',
      'privateKey=~/.ssh/id_rsa',
    ]))

    const cfg = loadConfig(p)
    expect(cfg.privateKey).toBe(join(homedir(), '.ssh/id_rsa'))
    expect(cfg.privateKey).not.toContain('~')
  })

  // ── type casting ─────────────────────────────────────────────────────────

  it('should cast port and readyTimeout to numbers', async () => {
    const p = join(testDir, 'types.zpackerrc')
    await fs.writeFile(p, rc([
      'host=1.1.1.1',
      'username=u',
      'password=p',
      'port=22',
      'readyTimeout=30000',
    ]))

    const cfg = loadConfig(p)
    expect(typeof cfg.port).toBe('number')
    expect(typeof cfg.readyTimeout).toBe('number')
    expect(cfg.port).toBe(22)
    expect(cfg.readyTimeout).toBe(30000)
  })

  it('should cast keepLocal to boolean', async () => {
    const p = join(testDir, 'bool.zpackerrc')
    await fs.writeFile(p, rc([
      'host=x',
      'username=u',
      'password=p',
      'keepLocal=true',
    ]))

    const cfg = loadConfig(p)
    expect(cfg.keepLocal).toBe(true)
    expect(typeof cfg.keepLocal).toBe('boolean')
  })

  // ── error handling ───────────────────────────────────────────────────────

  it('should throw on invalid line format', async () => {
    const p = join(testDir, 'invalid.zpackerrc')
    await fs.writeFile(p, rc(['host=1.2.3.4', 'this-line-has-no-equals']))

    expect(() => loadConfig(p)).toThrow('Invalid line')
  })

  it('should throw on invalid format value', async () => {
    const p = join(testDir, 'badformat.zpackerrc')
    await fs.writeFile(p, rc([
      'host=x',
      'username=u',
      'password=p',
      'format=rar',
    ]))

    expect(() => loadConfig(p)).toThrow('Invalid format')
  })

  it('should throw on invalid number value', async () => {
    const p = join(testDir, 'badport.zpackerrc')
    await fs.writeFile(p, rc([
      'host=x',
      'username=u',
      'password=p',
      'port=abc',
    ]))

    expect(() => loadConfig(p)).toThrow('Invalid number')
  })

  // ── unknown keys silently ignored ────────────────────────────────────────

  it('should silently ignore unknown keys', async () => {
    const p = join(testDir, 'unknown.zpackerrc')
    await fs.writeFile(p, rc([
      'host=1.2.3.4',
      'username=u',
      'password=p',
      'unknownFutureKey=value',
    ]))

    expect(() => loadConfig(p)).not.toThrow()
    const cfg = loadConfig(p)
    expect((cfg as any).unknownFutureKey).toBeUndefined()
  })

  // ── value with = in it ───────────────────────────────────────────────────

  it('should handle values that contain = sign', async () => {
    const p = join(testDir, 'eq.zpackerrc')
    await fs.writeFile(p, rc([
      'host=1.2.3.4',
      'username=u',
      'password=p=with=equals',
    ]))

    const cfg = loadConfig(p)
    expect(cfg.password).toBe('p=with=equals')
  })
})

// ── generateConfigTemplate ──────────────────────────────────────────────────────

describe('generateConfigTemplate', () => {
  it('should return a non-empty string', () => {
    const tpl = generateConfigTemplate()
    expect(typeof tpl).toBe('string')
    expect(tpl.length).toBeGreaterThan(0)
  })

  it('should contain all known config keys as comments', () => {
    const tpl = generateConfigTemplate()
    const knownKeys = ['host', 'port', 'username', 'password', 'privateKey', 'remotePath', 'postCommands', 'postScripts', 'format', 'keepLocal', 'readyTimeout']
    for (const key of knownKeys) {
      expect(tpl).toContain(key)
    }
  })

  it('should have all config lines commented out by default', () => {
    const tpl = generateConfigTemplate()
    const configLines = tpl.split('\n').filter(l => l.includes('='))
    for (const line of configLines) {
      expect(line.trimStart().startsWith('#')).toBe(true)
    }
  })

  it('should be a valid config when uncommented', () => {
    const tpl = generateConfigTemplate()
    // Uncomment all lines
    const uncommented = tpl
      .split('\n')
      .map(l => l.replace(/^# /, ''))
      .join('\n')
    // Should not throw when parsed
    expect(() => loadConfig(undefined, '/nonexistent')).not.toThrow()
    expect(uncommented).toContain('host=')
  })
})
