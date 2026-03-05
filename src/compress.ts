import { createWriteStream } from 'node:fs'
import { basename, join } from 'node:path'
import process from 'node:process'
import archiver from 'archiver'
import fs from 'fs-extra'
import { globby } from 'globby'

export interface FileStatus {
  name: string
  size: number
  status: 'OK' | 'ERROR'
}

export interface CompressResult {
  zipName: string
  outputPath: string
  totalSize: number
  files: FileStatus[]
}

export type CompressFormat = 'zip' | 'tar' | 'tar.gz'

export interface CompressOptions {
  input: string
  output?: string
  name?: string
  format?: CompressFormat
  onScan?: (absoluteInput: string) => void
  onFound?: (count: number) => void
  onStart?: (outputPath: string) => void
  onProgress?: (current: number, total: number) => void
  onEntry?: (file: string, size: number) => void
}

function getExtension(format: CompressFormat): string {
  switch (format) {
    case 'tar': return '.tar'
    case 'tar.gz': return '.tar.gz'
    case 'zip':
    default: return '.zip'
  }
}

export async function compress(options: CompressOptions): Promise<CompressResult> {
  const { input, output = '.', name, format = 'zip' } = options

  const absoluteInput = join(process.cwd(), input)

  let projectName = basename(absoluteInput)
  let projectVersion = ''

  const pkgPath = join(absoluteInput, 'package.json')
  if (await fs.pathExists(pkgPath)) {
    try {
      const pkg = await fs.readJson(pkgPath)
      if (pkg.name)
        projectName = pkg.name
      if (pkg.version)
        projectVersion = `_v${pkg.version}`
    }
    catch {
      // Ignore
    }
  }

  const ext = getExtension(format)
  const zipName = name || `${projectName}${projectVersion}${ext}`
  const outputPath = join(process.cwd(), output, zipName)

  options.onScan?.(absoluteInput)

  const files = await globby(['**/*', `!${zipName}`], {
    cwd: absoluteInput,
    gitignore: true,
    dot: true,
  })

  options.onFound?.(files.length)

  if (files.length === 0) {
    return {
      zipName,
      outputPath,
      totalSize: 0,
      files: [],
    }
  }

  options.onStart?.(outputPath)

  const outputStream = createWriteStream(outputPath)

  let archive: archiver.Archiver
  if (format === 'zip') {
    archive = archiver('zip', { zlib: { level: 9 } })
  }
  else if (format === 'tar.gz') {
    archive = archiver('tar', { gzip: true, gzipOptions: { level: 9 } })
  }
  else {
    // tar (no compression)
    archive = archiver('tar')
  }

  const fileResults: FileStatus[] = []

  return new Promise<CompressResult>((resolve, reject) => {
    outputStream.on('close', () => {
      const stats = fs.statSync(outputPath)
      resolve({
        zipName,
        outputPath,
        totalSize: stats.size,
        files: fileResults,
      })
    })

    archive.on('error', (err) => {
      reject(err)
    })

    archive.on('entry', () => {
      // Handled in the loop for more control
    })

    archive.pipe(outputStream)

    ;(async () => {
      let current = 0
      for (const file of files) {
        const filePath = join(absoluteInput, file)
        const stats = await fs.stat(filePath)
        const content = await fs.readFile(filePath)

        archive.append(content, { name: file })

        current++
        fileResults.push({ name: file, size: stats.size, status: 'OK' })
        options.onEntry?.(file, stats.size)
        options.onProgress?.(current, files.length)
      }
      archive.finalize()
    })().catch(reject)
  })
}
