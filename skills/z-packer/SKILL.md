---
name: z-packer
description: Package your project and deploy via SSH/SFTP. Automatically respects .gitignore.
---

# z-packer Skill

A versatile tool for packaging projects and deploying them to remote servers.

## Tools

### scan
Preview which files will be included in the archive. Use this to verify `.gitignore` rules.

### pack
Compress the project into `zip`, `tar`, or `tar.gz`.

### deploy
Pack and upload to a remote server in one step. If you have configured the `z-packer` plugin, it will use your default credentials.

### init
Generate a `.zpackerrc` configuration template for local development.

## Instructions
1. **Packaging**: If the user wants to zip a project, use `pack`.
2. **Deployment**: Before deploying, you can call `scan` to show the user what will be sent.
3. **Configuration**: If credentials are missing, guide the user to fill them in the plugin settings or provide them as parameters.
4. **Best Practices**: Use `tar.gz` for Linux targets to minimize upload size.
