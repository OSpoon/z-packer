import { join } from 'node:path'
import fs from 'fs-extra'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { compress } from '../src/compress'

const testDir = join(process.cwd(), 'temp-test-dir')

describe('compress', () => {
  beforeAll(async () => {
    await fs.ensureDir(testDir)
    // Create test files
    await fs.writeFile(join(testDir, 'file1.txt'), 'hello')
    await fs.ensureDir(join(testDir, 'subdir'))
    await fs.writeFile(join(testDir, 'subdir/file2.txt'), 'world')
    await fs.writeFile(join(testDir, '.gitignore'), 'ignored.txt')
    await fs.writeFile(join(testDir, 'ignored.txt'), 'should be ignored')
  })

  afterAll(async () => {
    await fs.remove(testDir)
    const zips = [
      join(process.cwd(), 'temp-test-dir.zip'),
      join(process.cwd(), 'custom.zip'),
    ]
    for (const zip of zips) {
      if (await fs.pathExists(zip))
        await fs.remove(zip)
    }
  })

  it('should compress files correctly and respect .gitignore', async () => {
    const onEntry = vi.fn()
    const result = await compress({
      input: 'temp-test-dir',
      onEntry,
    })

    expect(result.zipName).toBe('temp-test-dir.zip')
    expect(result.files.length).toBe(3) // file1.txt, subdir/file2.txt, .gitignore

    const fileNames = result.files.map(f => f.name)
    expect(fileNames).toContain('file1.txt')
    expect(fileNames).toContain('subdir/file2.txt')
    expect(fileNames).toContain('.gitignore')
    expect(fileNames).not.toContain('ignored.txt')

    expect(onEntry).toHaveBeenCalled()
    expect(await fs.pathExists(result.outputPath)).toBe(true)
  })

  it('should handle custom output name', async () => {
    const result = await compress({
      input: 'temp-test-dir',
      name: 'custom.zip',
    })

    expect(result.zipName).toBe('custom.zip')
    expect(result.outputPath).toContain('custom.zip')
    expect(await fs.pathExists(result.outputPath)).toBe(true)
  })

  it('should trigger hooks in order', async () => {
    const hooks = {
      onScan: vi.fn(),
      onFound: vi.fn(),
      onStart: vi.fn(),
      onProgress: vi.fn(),
    }

    await compress({
      input: 'temp-test-dir',
      ...hooks,
    })

    expect(hooks.onScan).toHaveBeenCalled()
    expect(hooks.onFound).toHaveBeenCalledWith(expect.any(Number))
    expect(hooks.onStart).toHaveBeenCalled()
    expect(hooks.onProgress).toHaveBeenCalled()
  })

  it('should handle empty directory gracefully', async () => {
    const emptyDir = join(testDir, 'empty-dir')
    await fs.ensureDir(emptyDir)

    const result = await compress({
      input: 'temp-test-dir/empty-dir',
    })

    expect(result.files.length).toBe(0)
    expect(result.totalSize).toBe(0)
  })
})
