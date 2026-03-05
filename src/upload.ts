import type { Buffer } from 'node:buffer'
import { createReadStream } from 'node:fs'
import { basename } from 'node:path'
import fs from 'fs-extra'
import { Client } from 'ssh2'

export interface UploadOptions {
  /** Local file path to upload */
  localFile: string
  /** Remote server host */
  host: string
  /** SSH port (default: 22) */
  port?: number
  /** Login username */
  username: string
  /** Password authentication */
  password?: string
  /** Private key content (PEM string), not a file path */
  privateKey?: string
  /** Remote directory to upload into (default: /tmp) */
  remotePath?: string
  /** SSH connection ready timeout in milliseconds (default: 20000) */
  readyTimeout?: number
  /** Called when SSH connection is established */
  onConnect?: () => void
  /** Called with bytes transferred and total bytes */
  onProgress?: (transferred: number, total: number) => void
  /** Called when upload finishes, with the remote file path */
  onDone?: (remoteFile: string) => void
}

export interface UploadResult {
  remoteFile: string
}

export async function upload(options: UploadOptions): Promise<UploadResult> {
  const {
    localFile,
    host,
    port = 22,
    username,
    password,
    privateKey,
    remotePath = '/tmp',
    readyTimeout = 20000,
    onConnect,
    onProgress,
    onDone,
  } = options

  if (!password && !privateKey) {
    throw new Error('Either --password or --private-key must be provided.')
  }

  const stats = await fs.stat(localFile)
  const totalSize = stats.size
  const remoteFile = `${remotePath.replace(/\/$/, '')}/${basename(localFile)}`

  const connConfig: Parameters<Client['connect']>[0] = {
    host,
    port,
    username,
    readyTimeout,
    ...(password ? { password } : {}),
    ...(privateKey ? { privateKey } : {}),
  }

  return new Promise<UploadResult>((resolve, reject) => {
    const conn = new Client()

    conn.on('ready', () => {
      onConnect?.()

      conn.sftp((err, sftp) => {
        if (err) {
          conn.end()
          return reject(err)
        }

        // Ensure remote directory exists
        sftp.mkdir(remotePath, () => {
          // Ignore error (directory may already exist)
          const readStream = createReadStream(localFile)
          const writeStream = sftp.createWriteStream(remoteFile)

          let transferred = 0
          readStream.on('data', (chunk: Buffer) => {
            transferred += chunk.length
            onProgress?.(transferred, totalSize)
          })

          writeStream.on('close', () => {
            conn.end()
            onDone?.(remoteFile)
            resolve({ remoteFile })
          })

          writeStream.on('error', (writeErr: Error) => {
            conn.end()
            reject(writeErr)
          })

          readStream.pipe(writeStream)
        })
      })
    })

    conn.on('error', (err) => {
      reject(err)
    })

    conn.connect(connConfig)
  })
}
