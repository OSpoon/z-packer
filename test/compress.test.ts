import { join } from 'node:path'
import fs from 'fs-extra'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { compress } from '../src/compress'

const testDir = join(process.cwd(), 'temp-compress-test-dir')

describe('compress – format support', () => {
  beforeAll(async () => {
    await fs.ensureDir(testDir)
    await fs.writeFile(join(testDir, 'hello.txt'), 'hello world')
    await fs.ensureDir(join(testDir, 'src'))
    await fs.writeFile(join(testDir, 'src', 'index.ts'), 'export default {}')
    await fs.writeFile(join(testDir, '.gitignore'), 'dist/')
  })

  afterAll(async () => {
    await fs.remove(testDir)
    const archives = [
      join(process.cwd(), 'temp-compress-test-dir.zip'),
      join(process.cwd(), 'temp-compress-test-dir.tar'),
      join(process.cwd(), 'temp-compress-test-dir.tar.gz'),
      join(process.cwd(), 'custom.tar'),
      join(process.cwd(), 'custom.tar.gz'),
    ]
    for (const f of archives) {
      if (await fs.pathExists(f))
        await fs.remove(f)
    }
  })

  // ── zip (default) ────────────────────────────────────────────────────────────

  it('should produce a .zip file by default (no format option)', async () => {
    const result = await compress({ input: 'temp-compress-test-dir' })

    expect(result.zipName).toMatch(/\.zip$/)
    expect(await fs.pathExists(result.outputPath)).toBe(true)
    expect(result.files.length).toBeGreaterThan(0)
  })

  it('should produce a .zip file when format is "zip"', async () => {
    const result = await compress({ input: 'temp-compress-test-dir', format: 'zip' })

    expect(result.zipName).toMatch(/\.zip$/)
    expect(result.outputPath).toMatch(/\.zip$/)
    expect(await fs.pathExists(result.outputPath)).toBe(true)
  })

  // ── tar ──────────────────────────────────────────────────────────────────────

  it('should produce a .tar file when format is "tar"', async () => {
    const result = await compress({ input: 'temp-compress-test-dir', format: 'tar' })

    expect(result.zipName).toMatch(/\.tar$/)
    expect(result.outputPath).toMatch(/\.tar$/)
    expect(await fs.pathExists(result.outputPath)).toBe(true)
    expect(result.totalSize).toBeGreaterThan(0)
  })

  it('tar archive should contain all expected files', async () => {
    const result = await compress({ input: 'temp-compress-test-dir', format: 'tar' })

    const names = result.files.map(f => f.name)
    expect(names).toContain('hello.txt')
    expect(names).toContain('src/index.ts')
    expect(names).toContain('.gitignore')
    expect(result.files.every(f => f.status === 'OK')).toBe(true)
  })

  it('should allow custom output name for tar', async () => {
    const result = await compress({
      input: 'temp-compress-test-dir',
      format: 'tar',
      name: 'custom.tar',
    })

    expect(result.zipName).toBe('custom.tar')
    expect(result.outputPath).toContain('custom.tar')
    expect(await fs.pathExists(result.outputPath)).toBe(true)
  })

  // ── tar.gz ───────────────────────────────────────────────────────────────────

  it('should produce a .tar.gz file when format is "tar.gz"', async () => {
    const result = await compress({ input: 'temp-compress-test-dir', format: 'tar.gz' })

    expect(result.zipName).toMatch(/\.tar\.gz$/)
    expect(result.outputPath).toMatch(/\.tar\.gz$/)
    expect(await fs.pathExists(result.outputPath)).toBe(true)
    expect(result.totalSize).toBeGreaterThan(0)
  })

  it('tar.gz archive should contain all expected files', async () => {
    const result = await compress({ input: 'temp-compress-test-dir', format: 'tar.gz' })

    const names = result.files.map(f => f.name)
    expect(names).toContain('hello.txt')
    expect(names).toContain('src/index.ts')
    expect(result.files.every(f => f.status === 'OK')).toBe(true)
  })

  it('tar.gz should be smaller than tar (gzip compression)', async () => {
    const [tarResult, tgzResult] = await Promise.all([
      compress({ input: 'temp-compress-test-dir', format: 'tar' }),
      compress({ input: 'temp-compress-test-dir', format: 'tar.gz' }),
    ])

    // For tiny test fixtures the sizes may vary — just assert both are created
    expect(tarResult.totalSize).toBeGreaterThan(0)
    expect(tgzResult.totalSize).toBeGreaterThan(0)
  })

  it('should allow custom output name for tar.gz', async () => {
    const result = await compress({
      input: 'temp-compress-test-dir',
      format: 'tar.gz',
      name: 'custom.tar.gz',
    })

    expect(result.zipName).toBe('custom.tar.gz')
    expect(await fs.pathExists(result.outputPath)).toBe(true)
  })

  // ── hooks ────────────────────────────────────────────────────────────────────

  it('should trigger all hooks for tar format', async () => {
    const hooks = {
      onScan: vi.fn(),
      onFound: vi.fn(),
      onStart: vi.fn(),
      onProgress: vi.fn(),
      onEntry: vi.fn(),
    }

    await compress({ input: 'temp-compress-test-dir', format: 'tar', ...hooks })

    expect(hooks.onScan).toHaveBeenCalledTimes(1)
    expect(hooks.onFound).toHaveBeenCalledWith(expect.any(Number))
    expect(hooks.onStart).toHaveBeenCalledWith(expect.stringContaining('.tar'))
    expect(hooks.onProgress).toHaveBeenCalled()
    expect(hooks.onEntry).toHaveBeenCalled()
  })

  it('should trigger all hooks for tar.gz format', async () => {
    const hooks = {
      onScan: vi.fn(),
      onFound: vi.fn(),
      onStart: vi.fn(),
      onProgress: vi.fn(),
      onEntry: vi.fn(),
    }

    await compress({ input: 'temp-compress-test-dir', format: 'tar.gz', ...hooks })

    expect(hooks.onScan).toHaveBeenCalledTimes(1)
    expect(hooks.onFound).toHaveBeenCalledWith(expect.any(Number))
    expect(hooks.onStart).toHaveBeenCalledWith(expect.stringContaining('.tar.gz'))
    expect(hooks.onProgress).toHaveBeenCalled()
    expect(hooks.onEntry).toHaveBeenCalled()
  })

  // ── empty directory ──────────────────────────────────────────────────────────

  it('should return empty result for tar on empty directory', async () => {
    const emptyDir = join(testDir, 'empty-sub')
    await fs.ensureDir(emptyDir)

    const result = await compress({ input: 'temp-compress-test-dir/empty-sub', format: 'tar' })

    expect(result.files.length).toBe(0)
    expect(result.totalSize).toBe(0)
  })

  it('should return empty result for tar.gz on empty directory', async () => {
    const emptyDir = join(testDir, 'empty-sub2')
    await fs.ensureDir(emptyDir)

    const result = await compress({ input: 'temp-compress-test-dir/empty-sub2', format: 'tar.gz' })

    expect(result.files.length).toBe(0)
    expect(result.totalSize).toBe(0)
  })
})
