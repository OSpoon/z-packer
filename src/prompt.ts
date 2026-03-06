import { input, password, select } from '@inquirer/prompts'

export interface DeployPromptResult {
  host?: string
  username?: string
  password?: string
  privateKey?: string
}

/**
 * Interactively prompt for any missing deploy fields.
 * Returns an object with only the prompted values (caller merges them).
 */
export async function promptDeployConfig(existing: {
  host?: string
  username?: string
  password?: string
  privateKey?: string
}): Promise<DeployPromptResult> {
  const result: DeployPromptResult = {}

  if (!existing.host) {
    result.host = await input({
      message: '🌐 Remote host (IP or domain):',
      validate: (v) => {
        if (!v.trim())
          return 'Host is required.'
        return true
      },
    })
  }

  if (!existing.username) {
    result.username = await input({
      message: '👤 SSH username:',
      validate: (v) => {
        if (!v.trim())
          return 'Username is required.'
        return true
      },
    })
  }

  if (!existing.password && !existing.privateKey) {
    const authMethod = await select({
      message: '🔑 Authentication method:',
      choices: [
        { name: 'Password', value: 'password' },
        { name: 'Private key file', value: 'privateKey' },
      ],
    })

    if (authMethod === 'password') {
      result.password = await password({
        message: '🔒 SSH password:',
        mask: '*',
        validate: (v) => {
          if (!v)
            return 'Password is required.'
          return true
        },
      })
    }
    else {
      result.privateKey = await input({
        message: '🗝️  Private key path:',
        default: '~/.ssh/id_rsa',
        validate: (v) => {
          if (!v.trim())
            return 'Private key path is required.'
          return true
        },
      })
    }
  }

  return result
}
