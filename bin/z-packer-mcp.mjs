#!/usr/bin/env node
import process from 'node:process'
import { startServer } from '../dist/mcp.mjs'

startServer().catch((error) => {
  console.error('MCP server fatal error:', error)
  process.exit(1)
})
