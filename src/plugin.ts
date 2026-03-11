import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { filesize } from 'filesize'
import fs from 'fs-extra'
import { compress, scan } from './compress'
import { generateConfigTemplate } from './config'
import { upload } from './upload'

export default {
  id: 'z-packer',
  name: 'z-packer',
  configSchema: {
    type: 'object',
    properties: {
      host: { type: 'string' },
      port: { type: 'number', default: 22 },
      username: { type: 'string' },
      password: { type: 'string' },
      privateKeyPath: { type: 'string' },
      remotePath: { type: 'string', default: '/tmp' },
    },
  },
  uiHints: {
    password: { label: 'SSH Password', sensitive: true },
    privateKeyPath: { label: 'Private Key Path', placeholder: '~/.ssh/id_rsa' },
    remotePath: { label: 'Remote Deploy Path', placeholder: '/var/www/app' },
  },
  register(api: any) {
    // --- Tool: scan ---
    api.registerTool({
      name: 'z_packer_scan',
      description: 'Preview which files will be included in the archive.',
      schema: {
        type: 'object',
        properties: {
          input: { type: 'string', default: '.' },
          format: { type: 'string', enum: ['zip', 'tar', 'tar.gz'], default: 'zip' },
        },
      },
      async handler({ input, format }: any) {
        try {
          const result = await scan(input, format)
          const fileList = result.files.map((f: any) => `- ${f.name} (${filesize(f.size)})`).join('\n')
          return [
            `✅ Found ${result.files.length} files`,
            `📦 Target: ${result.zipName}`,
            `📊 Total source size: ${filesize(result.totalSize)}`,
            `\nFiles:\n${fileList}`,
          ].join('\n')
        }
        catch (error: any) {
          throw new Error(`Scan failed: ${error.message}`)
        }
      },
    })

    // --- Tool: pack ---
    api.registerTool({
      name: 'z_packer_pack',
      description: 'Compress a local project directory into an archive.',
      schema: {
        type: 'object',
        properties: {
          input: { type: 'string', default: '.' },
          format: { type: 'string', enum: ['zip', 'tar', 'tar.gz'], default: 'zip' },
          name: { type: 'string' },
        },
      },
      async handler({ input, format, name }: any) {
        try {
          const result = await compress({ input, format, name })
          return `Successfully created archive: ${result.zipName}\nOutput path: ${result.outputPath}\nTotal size: ${filesize(result.totalSize)}`
        }
        catch (error: any) {
          throw new Error(`Compression failed: ${error.message}`)
        }
      },
    })

    // --- Tool: deploy ---
    api.registerTool({
      name: 'z_packer_deploy',
      description: 'Compress the project and upload it to a remote server over SSH/SFTP.',
      schema: {
        type: 'object',
        properties: {
          input: { type: 'string', default: '.' },
          format: { type: 'string', enum: ['zip', 'tar', 'tar.gz'], default: 'zip' },
          host: { type: 'string' },
          port: { type: 'number' },
          username: { type: 'string' },
          password: { type: 'string' },
          privateKeyPath: { type: 'string' },
          remotePath: { type: 'string' },
          keepLocal: { type: 'boolean', default: false },
        },
      },
      async handler(args: any, { config }: any) {
        try {
          // Merge args with global config
          const host = args.host || config.host
          const port = args.port || config.port || 22
          const username = args.username || config.username
          const password = args.password || config.password
          const privateKeyPath = args.privateKeyPath || config.privateKeyPath
          const remotePath = args.remotePath || config.remotePath || '/tmp'

          if (!host || !username) {
            throw new Error('Missing SSH host or username. Please configure the plugin or provide them as arguments.')
          }

          const compressResult = await compress({
            input: args.input,
            format: args.format,
          })
          const localFilePath = compressResult.outputPath

          let privateKey: string | undefined
          if (privateKeyPath) {
            privateKey = readFileSync(privateKeyPath, 'utf-8')
          }

          const uploadResult = await upload({
            localFile: localFilePath,
            host,
            port,
            username,
            password,
            privateKey,
            remotePath,
          })

          if (!args.keepLocal) {
            await fs.remove(localFilePath)
          }

          return `Deployment successful!\nRemote file: ${uploadResult.remoteFile}\nLocal archive ${args.keepLocal ? 'kept' : 'removed'}.`
        }
        catch (error: any) {
          throw new Error(`Deployment failed: ${error.message}`)
        }
      },
    })

    // --- Tool: init ---
    api.registerTool({
      name: 'z_packer_init',
      description: 'Generate a .zpackerrc configuration template.',
      schema: {
        type: 'object',
        properties: {
          directory: { type: 'string', default: '.' },
          force: { type: 'boolean', default: false },
        },
      },
      async handler({ directory, force }: any) {
        try {
          const targetPath = join(process.cwd(), directory, '.zpackerrc')
          if (await fs.pathExists(targetPath) && !force) {
            throw new Error(`.zpackerrc already exists at ${targetPath}. Use force=true to overwrite.`)
          }
          const template = generateConfigTemplate()
          await fs.writeFile(targetPath, template, 'utf-8')
          return `Successfully created .zpackerrc template at ${targetPath}`
        }
        catch (error: any) {
          throw new Error(`Init failed: ${error.message}`)
        }
      },
    })
  },
}
