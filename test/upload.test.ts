import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// ── Mock fs-extra (stat must resolve before ssh2 connects) ───────────────────
vi.mock('fs-extra', async () => {
  const actual = await vi.importActual<typeof import('fs-extra')>('fs-extra')
  return {
    ...actual,
    stat: vi.fn().mockResolvedValue({ size: 1024 }),
  }
})

// ── Helpers: Fake readable stream ─────────────────────────────────────────────
class FakeReadStream extends EventEmitter {
  pipe(dest: any) {
    // Immediately emit a data chunk then end
    setImmediate(() => {
      this.emit('data', Buffer.alloc(512))
      dest.emit('close')
    })
    return dest
  }
}

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    createReadStream: vi.fn(() => new FakeReadStream()),
  }
})

// ── Mock ssh2 ────────────────────────────────────────────────────────────────
class FakeSftp {
  mkdir(_path: string, cb: () => void) { cb() }
  createWriteStream(_path: string) {
    const ws = new EventEmitter() as EventEmitter & { write: () => void }
    ws.write = () => {}
    return ws
  }
}

// Controls whether the next FakeClient.connect() should emit an error
let shouldConnectFail = false

class FakeClient extends EventEmitter {
  connect(_config: any) {
    const willFail = shouldConnectFail
    setImmediate(() => {
      if (willFail)
        this.emit('error', new Error('Connection refused'))
      else
        this.emit('ready')
    })
  }

  sftp(cb: (err: Error | null, sftp: FakeSftp | null) => void) {
    cb(null, new FakeSftp())
  }

  end() {}
}

// We need to control per-test behavior, so we keep a registry.
let currentClient: FakeClient

vi.mock('ssh2', () => ({
  Client: vi.fn(() => {
    currentClient = new FakeClient()
    return currentClient
  }),
}))

// ── import upload AFTER mocks are set up ─────────────────────────────────────
const { upload } = await import('../src/upload')

// ── Tests ────────────────────────────────────────────────────────────────────

describe('upload', () => {
  const localFile = join(process.cwd(), 'test', 'index.test.ts')

  afterEach(() => {
    vi.clearAllMocks()
    shouldConnectFail = false
  })

  it('should resolve with correct remoteFile on successful upload', async () => {
    const onConnect = vi.fn()
    const onDone = vi.fn()
    const onProgress = vi.fn()

    const result = await upload({
      localFile,
      host: '127.0.0.1',
      username: 'user',
      password: 'pass',
      remotePath: '/tmp',
      onConnect,
      onDone,
      onProgress,
    })

    expect(result.remoteFile).toBe('/tmp/index.test.ts')
    expect(onConnect).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith('/tmp/index.test.ts')
    expect(onProgress).toHaveBeenCalled()
  })

  it('should reject when SSH connection emits an error', async () => {
    shouldConnectFail = true

    await expect(
      upload({
        localFile,
        host: '127.0.0.1',
        username: 'user',
        password: 'pass',
      }),
    ).rejects.toThrow('Connection refused')
  })

  it('should throw if neither password nor privateKey is provided', async () => {
    await expect(
      upload({ localFile, host: '127.0.0.1', username: 'user' }),
    ).rejects.toThrow('Either --password or --private-key must be provided')
  })

  it('should construct correct remoteFile for custom remotePath', async () => {
    const onDone = vi.fn()

    const result = await upload({
      localFile,
      host: '127.0.0.1',
      username: 'user',
      password: 'pass',
      remotePath: '/home/deploy/uploads',
      onDone,
    })

    expect(result.remoteFile).toBe('/home/deploy/uploads/index.test.ts')
    expect(onDone).toHaveBeenCalledWith('/home/deploy/uploads/index.test.ts')
  })

  it('should strip trailing slash from remotePath', async () => {
    const result = await upload({
      localFile,
      host: '127.0.0.1',
      username: 'user',
      password: 'pass',
      remotePath: '/home/deploy/uploads/',
    })

    expect(result.remoteFile).toBe('/home/deploy/uploads/index.test.ts')
  })

  it('should use port 22 by default', async () => {
    const connectSpy = vi.spyOn(FakeClient.prototype, 'connect')

    await upload({
      localFile,
      host: '127.0.0.1',
      username: 'user',
      password: 'pass',
    })

    expect(connectSpy).toHaveBeenCalledWith(
      expect.objectContaining({ port: 22, readyTimeout: 20000 }),
    )
  })

  it('should pass custom readyTimeout', async () => {
    const connectSpy = vi.spyOn(FakeClient.prototype, 'connect')

    await upload({
      localFile,
      host: '127.0.0.1',
      username: 'user',
      password: 'pass',
      readyTimeout: 5000,
    })

    expect(connectSpy).toHaveBeenCalledWith(
      expect.objectContaining({ readyTimeout: 5000 }),
    )
  })
})
