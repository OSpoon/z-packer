import type { ArgumentsCamelCase } from 'yargs'
import { join } from 'node:path'
import process from 'node:process'
import chalk from 'chalk'
import fs from 'fs-extra'
import { generateConfigTemplate } from '../config'

export async function initHandler(argv: ArgumentsCamelCase): Promise<void> {
  const targetPath = join(process.cwd(), '.zpackerrc')
  const force = argv.force as boolean

  if (await fs.pathExists(targetPath) && !force) {
    console.log(chalk.yellow(`⚠️ .zpackerrc already exists at ${chalk.bold(targetPath)}`))
    console.log(chalk.gray('   Use --force to overwrite.'))
    return
  }

  const template = generateConfigTemplate()
  await fs.writeFile(targetPath, template, 'utf-8')

  console.log(chalk.green(`✅ Created ${chalk.bold('.zpackerrc')} at ${chalk.bold(targetPath)}`))
  console.log(chalk.gray('   Edit this file to configure your SSH deploy settings.'))
  console.log(chalk.yellow('   💡 Remember to add .zpackerrc to your .gitignore!'))
  console.log()
}
