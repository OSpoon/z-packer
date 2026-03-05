import type { CompressFormat } from './compress'
import type { ZPackerConfig } from './config'
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
import { loadConfig } from './config'
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
          choices: ['zip', 'tar', 'tar.gz'],
          describe: 'Archive format: zip | tar | tar.gz (default: zip)',
        })
        .option('config', {
          type: 'string',
          describe: 'Path to a custom config file (default: .zpackerrc)',
        })
    },
    async (argv) => {
      const input = argv.input as string

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
        .option('config', {
          type: 'string',
          describe: 'Path to a custom config file (default: .zpackerrc)',
        })
        .option('format', {
          type: 'string',
          choices: ['zip', 'tar', 'tar.gz'],
          describe: 'Archive format: zip | tar | tar.gz (default: zip)',
        })
        .option('host', {
          type: 'string',
          describe: 'Remote server hostname or IP',
        })
        .option('port', {
          type: 'number',
          describe: 'SSH port (default: 22)',
        })
        .option('username', {
          type: 'string',
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
          describe: 'Remote directory to upload the archive into (default: /tmp)',
        })
        .option('keep-local', {
          type: 'boolean',
          describe: 'Keep the local archive after upload',
        })
        .option('ready-timeout', {
          type: 'number',
          describe: 'SSH connection ready timeout in milliseconds (default: 20000)',
        })
    },
    async (argv) => {
      // ── Load & merge config ────────────────────────────────────────────────
      let cfg: ZPackerConfig = {}
      try {
        cfg = loadConfig(argv.config as string | undefined)
        if (Object.keys(cfg).length > 0) {
          console.log(chalk.gray('📄 Loaded config from .zpackerrc'))
        }
      }
      catch (err) {
        console.error(chalk.red(`❌ ${(err as Error).message}`))
        process.exit(1)
      }

      // CLI args take precedence over config file
      const input = argv.input as string
      const format = (argv.format ?? cfg.format ?? 'zip') as CompressFormat
      const host = (argv.host as string | undefined) ?? cfg.host
      const port = (argv.port as number | undefined) ?? cfg.port ?? 22
      const username = (argv.username as string | undefined) ?? cfg.username
      const password = (argv.password as string | undefined) ?? cfg.password
      const privateKeyPath = (argv['private-key'] as string | undefined) ?? cfg.privateKey
      const remotePath = (argv['remote-path'] as string | undefined) ?? cfg.remotePath ?? '/tmp'
      const keepLocal = (argv['keep-local'] as boolean | undefined) ?? cfg.keepLocal ?? false
      const readyTimeout = (argv['ready-timeout'] as number | undefined) ?? cfg.readyTimeout ?? 20000

      // ── Validate required fields after merge ───────────────────────────────
      if (!host) {
        console.error(chalk.red('❌ Missing required option: --host (or set "host" in .zpackerrc)'))
        process.exit(1)
      }
      if (!username) {
        console.error(chalk.red('❌ Missing required option: --username (or set "username" in .zpackerrc)'))
        process.exit(1)
      }
      if (!password && !privateKeyPath) {
        console.error(chalk.red('❌ Missing auth: provide --password or --private-key (or set in .zpackerrc)'))
        process.exit(1)
      }

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
      if (privateKeyPath) {
        try {
          resolvedPrivateKey = readFileSync(privateKeyPath, 'utf-8')
        }
        catch {
          console.error(chalk.red(`❌ Cannot read private key: ${privateKeyPath}`))
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
