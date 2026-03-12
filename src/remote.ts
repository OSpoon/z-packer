import type { SFTPWrapper } from 'ssh2'
import { Buffer } from 'node:buffer'
import { createReadStream } from 'node:fs'
import { dirname } from 'node:path'
import { Client } from 'ssh2'

export interface RemoteStep {
  label: string
  command: string
}

export interface RemoteCommandResult {
  label: string
  command: string
  code: number | null
  signal: string | null
  stdout: string
  stderr: string
  durationMs: number
}

export interface RunRemoteCommandsOptions {
  host: string
  port?: number
  username: string
  password?: string
  privateKey?: string
  readyTimeout?: number
  uploads?: RemoteUpload[]
  steps: RemoteStep[]
  onConnect?: () => void
  onStepStart?: (step: RemoteStep, index: number, total: number) => void
  onStdout?: (chunk: string, step: RemoteStep) => void
  onStderr?: (chunk: string, step: RemoteStep) => void
  onStepDone?: (result: RemoteCommandResult, index: number, total: number) => void
}

export interface BuildRemoteStepsOptions {
  remoteFile: string
  postCommands?: string[]
  postScripts?: RemoteUpload[]
}

export interface RemoteTemplateContext {
  remoteFile: string
  remoteDir: string
}

export interface RemoteUpload {
  localPath: string
  remotePath: string
  mode?: number
}

export function buildRemoteSteps(options: BuildRemoteStepsOptions): RemoteStep[] {
  const postCommands = (options.postCommands ?? []).map(c => c.trim()).filter(Boolean)
  const postScripts = (options.postScripts ?? []).filter(item => item.localPath && item.remotePath)

  const context: RemoteTemplateContext = {
    remoteFile: options.remoteFile,
    remoteDir: dirname(options.remoteFile),
  }

  const steps: RemoteStep[] = []

  for (const [idx, upload] of postScripts.entries()) {
    const remoteScript = upload.remotePath
    steps.push({
      label: `Post script ${idx + 1}`,
      command: `chmod +x ${shellEscape(remoteScript)} && ${shellEscape(remoteScript)}`,
    })
  }

  for (const [idx, raw] of postCommands.entries()) {
    steps.push({
      label: `Post command ${idx + 1}`,
      command: renderTemplate(raw, context),
    })
  }

  return steps
}

export async function runRemoteCommands(options: RunRemoteCommandsOptions): Promise<RemoteCommandResult[]> {
  const {
    host,
    port = 22,
    username,
    password,
    privateKey,
    readyTimeout = 20000,
    uploads,
    steps,
    onConnect,
    onStepStart,
    onStdout,
    onStderr,
    onStepDone,
  } = options

  if (!password && !privateKey) {
    throw new Error('Either --password or --private-key must be provided.')
  }

  if (steps.length === 0)
    return []

  const connConfig: Parameters<Client['connect']>[0] = {
    host,
    port,
    username,
    readyTimeout,
    ...(password ? { password } : {}),
    ...(privateKey ? { privateKey } : {}),
  }

  return await new Promise<RemoteCommandResult[]>((resolve, reject) => {
    const conn = new Client()
    const results: RemoteCommandResult[] = []

    const finish = (err?: Error): void => {
      conn.end()
      if (err)
        reject(err)
      else
        resolve(results)
    }

    conn.on('ready', async () => {
      onConnect?.()

      try {
        await runUploads(conn, uploads ?? [])
      }
      catch (err) {
        return finish(err as Error)
      }

      for (let index = 0; index < steps.length; index += 1) {
        const step = steps[index]
        onStepStart?.(step, index, steps.length)

        try {
          const result = await execCommand(conn, step, onStdout, onStderr)
          results.push(result)
          onStepDone?.(result, index, steps.length)

          if (result.code && result.code !== 0) {
            return finish(new Error(`Remote command failed (${result.code}): ${step.command}`))
          }
        }
        catch (err) {
          return finish(err as Error)
        }
      }

      finish()
    })

    conn.on('error', (err) => {
      finish(err)
    })

    conn.connect(connConfig)
  })
}

function execCommand(
  conn: Client,
  step: RemoteStep,
  onStdout?: (chunk: string, step: RemoteStep) => void,
  onStderr?: (chunk: string, step: RemoteStep) => void,
): Promise<RemoteCommandResult> {
  return new Promise<RemoteCommandResult>((resolve, reject) => {
    const startedAt = Date.now()
    const stdoutChunks: string[] = []
    const stderrChunks: string[] = []

    conn.exec(step.command, (err, stream) => {
      if (err)
        return reject(err)

      stream.on('close', (code: number | null, signal: string | null) => {
        resolve({
          label: step.label,
          command: step.command,
          code,
          signal,
          stdout: stdoutChunks.join(''),
          stderr: stderrChunks.join(''),
          durationMs: Date.now() - startedAt,
        })
      })

      stream.on('data', (data: Buffer | string) => {
        const chunk = data instanceof Buffer ? data.toString('utf-8') : String(data)
        stdoutChunks.push(chunk)
        onStdout?.(chunk, step)
      })

      stream.stderr.on('data', (data: Buffer | string) => {
        const chunk = data instanceof Buffer ? data.toString('utf-8') : String(data)
        stderrChunks.push(chunk)
        onStderr?.(chunk, step)
      })
    })
  })
}

const TEMPLATE_VARS = new Set(['remoteFile', 'remoteDir'])

export function renderTemplate(template: string, context: RemoteTemplateContext): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    if (!TEMPLATE_VARS.has(key))
      return match
    return shellEscape(String((context as any)[key]))
  })
}

export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

async function runUploads(conn: Client, uploads: RemoteUpload[]): Promise<void> {
  if (uploads.length === 0)
    return

  const sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
    conn.sftp((err, sftpInstance) => {
      if (err || !sftpInstance)
        return reject(err ?? new Error('Failed to start SFTP session'))
      resolve(sftpInstance)
    })
  })

  for (const upload of uploads) {
    await new Promise<void>((resolve, reject) => {
      const remoteDir = dirname(upload.remotePath)
      sftp.mkdir(remoteDir, () => {
        const writeStream = sftp.createWriteStream(upload.remotePath, upload.mode ? { mode: upload.mode } : undefined)
        writeStream.on('close', () => resolve())
        writeStream.on('error', (err: Error) => reject(err))
        const readStream = createReadStream(upload.localPath)
        readStream.on('error', err => reject(err))
        readStream.pipe(writeStream)
      })
    })
  }
}
