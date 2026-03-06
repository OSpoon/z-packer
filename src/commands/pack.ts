import type { ArgumentsCamelCase } from 'yargs'
import type { CompressFormat } from '../compress'
import type { ZPackerConfig } from '../config'
import process from 'node:process'
import chalk from 'chalk'
import { Presets, SingleBar } from 'cli-progress'
import Table from 'cli-table3'
import { filesize } from 'filesize'
import { compress, scan } from '../compress'
import { loadConfig } from '../config'

export async function packHandler(argv: ArgumentsCamelCase): Promise<void> {
  const input = argv.input as string
  const dryRun = argv['dry-run'] as boolean

  // Load config file, CLI args override
  let cfg: ZPackerConfig = {}
  try {
    cfg = loadConfig(argv.config as string | undefined)
  }
  catch (err) {
    console.error(chalk.red(`❌ ${(err as Error).message}`))
    process.exit(1)
  }

  const format = (argv.format ?? cfg.format ?? 'zip') as CompressFormat

  // ── Dry-run mode ──────────────────────────────────────────────────────
  if (dryRun) {
    console.log(chalk.cyan(`🔍 Scanning project: ${chalk.bold(input)}`))
    try {
      const result = await scan(input, format)
      if (result.files.length === 0) {
        console.log(chalk.yellow('⚠️ No files found (check your .gitignore rules)'))
        return
      }

      console.log(chalk.green(`✅ Found ${chalk.bold(result.files.length)} files\n`))

      const table = new Table({
        head: [chalk.cyan('Filename'), chalk.cyan('Size')],
        colWidths: [55, 15],
      })
      for (const file of result.files) {
        table.push([file.name, filesize(file.size)])
      }
      console.log(table.toString())

      console.log(chalk.white(`\n   Archive name: ${chalk.bold(result.zipName)}`))
      console.log(chalk.white(`   Total source size: ${chalk.bold(filesize(result.totalSize))}`))
      console.log(chalk.gray('   (dry-run: no archive created)\n'))
    }
    catch (error) {
      console.error(chalk.red('❌ Scan failed:'), error)
      process.exit(1)
    }
    return
  }

  // ── Normal compress ────────────────────────────────────────────────────
  let progressBar: SingleBar | undefined
  let totalBytes = 0

  try {
    const result = await compress({
      input,
      format,
      onScan: (path) => {
        console.log(chalk.cyan(`🔍 Scanning project: ${chalk.bold(path)}`))
      },
      onFound: (count) => {
        if (count === 0) {
          console.log(chalk.yellow('⚠️ No files found (check your .gitignore rules)'))
        }
        else {
          console.log(chalk.green(`✅ Found ${chalk.bold(count)} files`))
        }
      },
      onTotalBytes: (bytes) => {
        totalBytes = bytes
      },
      onStart: (outputPath) => {
        console.log(chalk.cyan(`📦 Creating archive: ${chalk.bold(outputPath)}`))
        progressBar = new SingleBar({
          format: `${chalk.cyan('Compressing')} {bar} | {percentage}% | {currentSize} / {totalSize}`,
          hideCursor: true,
        }, Presets.shades_classic)
      },
      onProgress: (currentBytes, _totalBytes, _currentFiles, _totalFiles) => {
        if (progressBar) {
          if (currentBytes > 0 && !(progressBar as any).isActive)
            progressBar.start(totalBytes, 0, { currentSize: filesize(0), totalSize: filesize(totalBytes) })
          progressBar.update(currentBytes, { currentSize: filesize(currentBytes), totalSize: filesize(totalBytes) })
        }
      },
    })

    if (progressBar)
      progressBar.stop()

    if (result.files.length > 0) {
      if (result.files.length <= 20) {
        const table = new Table({
          head: [chalk.cyan('Filename'), chalk.cyan('Size'), chalk.cyan('Status')],
          colWidths: [40, 15, 12],
        })
        for (const file of result.files) {
          table.push([file.name, filesize(file.size), chalk.gray(file.status)])
        }
        console.log(`\n${table.toString()}`)
      }

      console.log(chalk.green('\n✨ Project archived successfully!'))
      console.log(chalk.white(`   Archive: ${chalk.bold(result.zipName)}`))
      console.log(chalk.white(`   Total Size: ${chalk.bold(filesize(result.totalSize))}`))
    }
    console.log()
  }
  catch (error) {
    if (progressBar)
      progressBar.stop()
    console.error(chalk.red('\n❌ Compression failed:'), error)
    process.exit(1)
  }
}
