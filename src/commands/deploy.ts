import type { ArgumentsCamelCase } from 'yargs'
import type { CompressFormat } from '../compress'
import type { ZPackerConfig } from '../config'
import type { RemoteUpload } from '../remote'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import process from 'node:process'
import chalk from 'chalk'
import { Presets, SingleBar } from 'cli-progress'
import { filesize } from 'filesize'
import fs from 'fs-extra'
import { compress } from '../compress'
import { loadConfig } from '../config'
import { promptDeployConfig } from '../prompt'
import { buildRemoteSteps, runRemoteCommands } from '../remote'
import { upload } from '../upload'

export async function deployHandler(argv: ArgumentsCamelCase): Promise<void> {
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
  let host = (argv.host as string | undefined) ?? cfg.host
  const port = (argv.port as number | undefined) ?? cfg.port ?? 22
  let username = (argv.username as string | undefined) ?? cfg.username
  let password = (argv.password as string | undefined) ?? cfg.password
  let privateKeyPath = (argv['private-key'] as string | undefined) ?? cfg.privateKey
  const remotePath = (argv['remote-path'] as string | undefined) ?? cfg.remotePath ?? '/tmp'
  const postCommandsCli = normalizeCommandList(argv['post-cmd'] as string[] | string | undefined)
  const postCommands = postCommandsCli.length > 0
    ? postCommandsCli
    : normalizeCommandList(cfg.postCommands)
  const postScriptsCli = normalizePathList(argv['post-script'] as string[] | string | undefined)
  const postScripts = postScriptsCli.length > 0
    ? postScriptsCli
    : normalizePathList(cfg.postScripts)
  const keepLocal = (argv['keep-local'] as boolean | undefined) ?? cfg.keepLocal ?? false
  const readyTimeout = (argv['ready-timeout'] as number | undefined) ?? cfg.readyTimeout ?? 20000
  const hasPostActions = postCommands.length > 0 || postScripts.length > 0
  const totalSteps = hasPostActions ? 3 : 2

  // ── Interactive prompts for missing fields ──────────────────────────────
  if (!host || !username || (!password && !privateKeyPath)) {
    try {
      console.log(chalk.cyan('\n🔧 Missing deploy configuration. Please provide the following:\n'))
      const prompted = await promptDeployConfig({ host, username, password, privateKey: privateKeyPath })
      if (prompted.host)
        host = prompted.host
      if (prompted.username)
        username = prompted.username
      if (prompted.password)
        password = prompted.password
      if (prompted.privateKey)
        privateKeyPath = prompted.privateKey
    }
    catch {
      console.error(chalk.red('\n❌ Prompt cancelled.'))
      process.exit(1)
    }
  }

  let progressBar: SingleBar | undefined
  let totalBytes = 0

  // ── Step 1: Compress ────────────────────────────────────────────────────
  console.log(chalk.bold.cyan(`\n── Step 1/${totalSteps}: Compressing ──────────────────────`))
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
  console.log(chalk.bold.cyan(`\n── Step 2/${totalSteps}: Uploading via SSH/SFTP ───────────`))
  console.log(chalk.white(`   Server: ${chalk.bold(`${username}@${host}:${port}`)}`))
  console.log(chalk.white(`   Remote path: ${chalk.bold(remotePath)}`))

  let uploadBar: SingleBar | undefined

  const localFilePath = compressResult.outputPath

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

  let uploadResult: Awaited<ReturnType<typeof upload>> | undefined

  try {
    uploadResult = await upload({
      localFile: localFilePath,
      host: host!,
      port,
      username: username!,
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

  // ── Step 3: Remote actions ──────────────────────────────────────────────
  if (hasPostActions && uploadResult) {
    const postScriptUploads = await resolvePostScriptUploads(postScripts, remotePath)
    const steps = buildRemoteSteps({
      remoteFile: uploadResult.remoteFile,
      postCommands,
      postScripts: postScriptUploads,
    })

    if (steps.length > 0) {
      console.log(chalk.bold.cyan(`\n── Step 3/${totalSteps}: Remote Actions ───────────`))
      try {
        await runRemoteCommands({
          host: host!,
          port,
          username: username!,
          ...(password ? { password } : {}),
          ...(resolvedPrivateKey ? { privateKey: resolvedPrivateKey } : {}),
          readyTimeout,
          uploads: postScriptUploads,
          steps,
          onConnect: () => {
            console.log(chalk.green('🛰  Remote command session started'))
          },
          onStepStart: (step, index, total) => {
            console.log(chalk.cyan(`▶ ${index + 1}/${total} ${step.label}`))
          },
          onStdout: (chunk) => {
            process.stdout.write(chalk.gray(chunk))
          },
          onStderr: (chunk) => {
            process.stderr.write(chalk.yellow(chunk))
          },
          onStepDone: (result, index, total) => {
            if (result.code === 0 || result.code === null)
              console.log(chalk.green(`✓ ${index + 1}/${total} ${result.label}`))
          },
        })
      }
      catch (error) {
        console.error(chalk.red('\n❌ Remote actions failed:'), error)
        process.exit(1)
      }
    }
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
}

function normalizeCommandList(value: string[] | string | undefined): string[] {
  if (!value)
    return []
  if (Array.isArray(value))
    return value.map(v => v.trim()).filter(Boolean)
  const trimmed = value.trim()
  return trimmed ? [trimmed] : []
}

function normalizePathList(value: string[] | string | undefined): string[] {
  if (!value)
    return []
  if (Array.isArray(value))
    return value.map(v => v.trim()).filter(Boolean)
  const trimmed = value.trim()
  if (!trimmed)
    return []
  return trimmed.split(',').map(v => v.trim()).filter(Boolean)
}

async function resolvePostScriptUploads(paths: string[], remoteBase: string): Promise<RemoteUpload[]> {
  if (paths.length === 0)
    return []
  const base = remoteBase.replace(/\/$/, '')
  const uploads = []
  for (const localPath of paths) {
    const exists = await fs.pathExists(localPath)
    if (!exists) {
      console.error(chalk.red(`\n❌ Post script not found: ${localPath}`))
      process.exit(1)
    }
    const remotePath = `${base}/${basename(localPath)}`
    uploads.push({ localPath, remotePath, mode: 0o755 })
  }
  return uploads
}
