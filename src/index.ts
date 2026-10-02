import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { selectProvider } from './config.js';
import { createServer } from './server.js';
try {
  const provider=selectProvider();
  await serveStdio(()=>createServer(provider));
} catch { console.error('Fantasy MCP startup failed. Check provider configuration.'); process.exitCode=1; }
