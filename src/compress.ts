import { createWriteStream } from 'node:fs'
import { basename, isAbsolute, join } from 'node:path'
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

export interface ScanResult {
  files: { name: string, size: number }[]
  totalSize: number
}

export interface CompressOptions {
  input: string
  output?: string
  name?: string
  format?: CompressFormat
  onScan?: (absoluteInput: string) => void
  onFound?: (count: number) => void
  onStart?: (outputPath: string) => void
  onTotalBytes?: (totalBytes: number) => void
  onProgress?: (currentBytes: number, totalBytes: number, currentFiles: number, totalFiles: number) => void
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

/**
 * Scan a project directory and return all files with their sizes.
 * Respects .gitignore like the compress function.
 */
export async function scan(input: string, format: CompressFormat = 'zip', name?: string): Promise<ScanResult & { zipName: string }> {
  const absoluteInput = isAbsolute(input) ? input : join(process.cwd(), input)

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

  const fileNames = await globby(['**/*', `!${zipName}`], {
    cwd: absoluteInput,
    gitignore: true,
    dot: true,
  })

  const files: { name: string, size: number }[] = []
  let totalSize = 0

  for (const file of fileNames) {
    const filePath = join(absoluteInput, file)
    const stats = await fs.stat(filePath)
    files.push({ name: file, size: stats.size })
    totalSize += stats.size
  }

  return { files, totalSize, zipName }
}

export async function compress(options: CompressOptions): Promise<CompressResult> {
  const { input, output, name, format = 'zip' } = options

  // Support both absolute and relative input paths
  const absoluteInput = isAbsolute(input) ? input : join(process.cwd(), input)
  // Default output to the same directory as input, not cwd
  const absoluteOutput = output
    ? (isAbsolute(output) ? output : join(process.cwd(), output))
    : absoluteInput

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
  const outputPath = join(absoluteOutput, zipName)

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

  // Pre-scan: collect file sizes for byte-level progress
  const fileSizes: Map<string, number> = new Map()
  let totalBytes = 0
  for (const file of files) {
    const filePath = join(absoluteInput, file)
    const stats = await fs.stat(filePath)
    fileSizes.set(file, stats.size)
    totalBytes += stats.size
  }

  options.onTotalBytes?.(totalBytes)

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
      let currentFiles = 0
      let currentBytes = 0
      for (const file of files) {
        const filePath = join(absoluteInput, file)
        const size = fileSizes.get(file) || 0
        const content = await fs.readFile(filePath)

        archive.append(content, { name: file })

        currentFiles++
        currentBytes += size
        fileResults.push({ name: file, size, status: 'OK' })
        options.onEntry?.(file, size)
        options.onProgress?.(currentBytes, totalBytes, currentFiles, files.length)
      }
      archive.finalize()
    })().catch(reject)
  })
}
