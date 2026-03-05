import type { CompressFormat } from './compress'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import chalk from 'chalk'
import { Presets, SingleBar } from 'cli-progress'
import Table from 'cli-table3'
import { filesize } from 'filesize'
import fs from 'fs-extra'
import yargs from 'yargs'
import { compress } from './compress'
import { upload } from './upload'

const instance = yargs(process.argv.slice(2))
  .scriptName('z-packer')
  .usage('$0 [input]')
  // ── pack (default) ───────────────────────────────────────────────────────────
  .command(
    ['$0 [input]', 'pack [input]'],
    'Compress project (default command)',
    (y) => {
      return y
        .positional('input', {
          type: 'string',
          default: '.',
          describe: 'Project directory',
        })
        .option('format', {
          type: 'string',
          default: 'zip',
          choices: ['zip', 'tar', 'tar.gz'],
          describe: 'Archive format: zip | tar | tar.gz',
        })
    },
    async (argv) => {
      const input = argv.input as string
      const format = argv.format as CompressFormat
      let progressBar: SingleBar | undefined

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
          onStart: (outputPath) => {
            console.log(chalk.cyan(`📦 Creating archive: ${chalk.bold(outputPath)}`))
            progressBar = new SingleBar({
              format: `${chalk.cyan('Compressing')} {bar} | {percentage}% | {value}/{total} files`,
              hideCursor: true,
            }, Presets.shades_classic)
          },
          onProgress: (current, total) => {
            if (progressBar) {
              if (current === 1)
                progressBar.start(total, 0)
              progressBar.update(current)
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
    },
  )
  // ── deploy ───────────────────────────────────────────────────────────────────
  .command(
    'deploy [input]',
    'Compress project then upload to a remote server via SSH/SFTP',
    (y) => {
      return y
        .positional('input', {
          type: 'string',
          default: '.',
          describe: 'Project directory to compress',
        })
        .option('format', {
          type: 'string',
          default: 'zip',
          choices: ['zip', 'tar', 'tar.gz'],
          describe: 'Archive format: zip | tar | tar.gz',
        })
        .option('host', {
          type: 'string',
          demandOption: true,
          describe: 'Remote server hostname or IP',
        })
        .option('port', {
          type: 'number',
          default: 22,
          describe: 'SSH port',
        })
        .option('username', {
          type: 'string',
          demandOption: true,
          describe: 'SSH login username',
        })
        .option('password', {
          type: 'string',
          describe: 'SSH password (use --private-key for key-based auth)',
        })
        .option('private-key', {
          type: 'string',
          describe: 'Path to SSH private key file (~/.ssh/id_rsa)',
        })
        .option('remote-path', {
          type: 'string',
          default: '/tmp',
          describe: 'Remote directory to upload the archive into',
        })
        .option('keep-local', {
          type: 'boolean',
          default: false,
          describe: 'Keep the local archive after upload',
        })
        .option('ready-timeout', {
          type: 'number',
          default: 20000,
          describe: 'SSH connection ready timeout in milliseconds',
        })
        .check((args) => {
          if (!args.password && !args['private-key']) {
            throw new Error('Either --password or --private-key must be provided')
          }
          return true
        })
    },
    async (argv) => {
      const input = argv.input as string
      const format = argv.format as CompressFormat
      const host = argv.host as string
      const port = argv.port as number
      const username = argv.username as string
      const password = argv.password as string | undefined
      const privateKey = argv['private-key'] as string | undefined
      const remotePath = argv['remote-path'] as string
      const keepLocal = argv['keep-local'] as boolean
      const readyTimeout = argv['ready-timeout'] as number

      let progressBar: SingleBar | undefined

      // ── Step 1: Compress ────────────────────────────────────────────────────
      console.log(chalk.bold.cyan('\n── Step 1/2: Compressing ──────────────────────'))
      let compressResult: Awaited<ReturnType<typeof compress>>
      try {
        compressResult = await compress({
          input,
          format,
          onScan: (path) => {
            console.log(chalk.cyan(`🔍 Scanning: ${chalk.bold(path)}`))
          },
          onFound: (count) => {
            if (count === 0)
              console.log(chalk.yellow('⚠️ No files found'))
            else
              console.log(chalk.green(`✅ Found ${chalk.bold(count)} files`))
          },
          onStart: (outputPath) => {
            console.log(chalk.cyan(`📦 Creating archive: ${chalk.bold(outputPath)}`))
            progressBar = new SingleBar({
              format: `${chalk.cyan('Compressing')} {bar} | {percentage}% | {value}/{total} files`,
              hideCursor: true,
            }, Presets.shades_classic)
          },
          onProgress: (current, total) => {
            if (progressBar) {
              if (current === 1)
                progressBar.start(total, 0)
              progressBar.update(current)
            }
          },
        })
        if (progressBar)
          progressBar.stop()

        console.log(chalk.green(`✨ Archive ready: ${chalk.bold(compressResult.zipName)} (${filesize(compressResult.totalSize)})`))
      }
      catch (error) {
        if (progressBar)
          progressBar.stop()
        console.error(chalk.red('\n❌ Compression failed:'), error)
        process.exit(1)
      }

      if (compressResult.files.length === 0) {
        console.log(chalk.yellow('⚠️ No files to upload.'))
        return
      }

      // ── Step 2: Upload via SFTP ─────────────────────────────────────────────
      console.log(chalk.bold.cyan('\n── Step 2/2: Uploading via SSH/SFTP ───────────'))
      console.log(chalk.white(`   Server: ${chalk.bold(`${username}@${host}:${port}`)}`))
      console.log(chalk.white(`   Remote path: ${chalk.bold(remotePath)}`))

      let uploadBar: SingleBar | undefined

      const localFilePath = join(process.cwd(), compressResult.zipName)

      // Resolve private key content if supplied as a path
      let resolvedPrivateKey: string | undefined
      if (privateKey) {
        try {
          resolvedPrivateKey = readFileSync(privateKey, 'utf-8')
        }
        catch {
          console.error(chalk.red(`❌ Cannot read private key: ${privateKey}`))
          process.exit(1)
        }
      }

      try {
        await upload({
          localFile: localFilePath,
          host,
          port,
          username,
          ...(password ? { password } : {}),
          ...(resolvedPrivateKey ? { privateKey: resolvedPrivateKey } : {}),
          remotePath,
          readyTimeout,
          onConnect: () => {
            console.log(chalk.green('🔗 SSH connection established'))
            uploadBar = new SingleBar({
              format: `${chalk.cyan('Uploading')}  {bar} | {percentage}% | {value}/{total} bytes`,
              hideCursor: true,
            }, Presets.shades_classic)
          },
          onProgress: (transferred, total) => {
            if (uploadBar) {
              if (transferred === 0 || (uploadBar as any).isActive === false)
                uploadBar.start(total, 0)
              uploadBar.update(transferred)
            }
          },
          onDone: (remoteFile) => {
            if (uploadBar)
              uploadBar.stop()
            console.log(chalk.green(`\n🚀 Upload complete!`))
            console.log(chalk.white(`   Remote file: ${chalk.bold(remoteFile)}`))
          },
        })
      }
      catch (error) {
        if (uploadBar)
          uploadBar.stop()
        console.error(chalk.red('\n❌ Upload failed:'), error)
        process.exit(1)
      }

      // ── Cleanup ─────────────────────────────────────────────────────────────
      if (!keepLocal) {
        try {
          await fs.remove(localFilePath)
          console.log(chalk.gray(`🗑  Local archive removed: ${compressResult.zipName}`))
        }
        catch {
          console.warn(chalk.yellow(`⚠️ Could not remove local archive: ${localFilePath}`))
        }
      }

      console.log()
    },
  )
  .showHelpOnFail(false)
  .help()

instance.parse()
