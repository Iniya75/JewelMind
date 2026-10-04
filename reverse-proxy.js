/**
 * Reverse Proxy Server
 * Runs on http://localhost:8000
 * Routes:
 *   /api/* → Backend (localhost:8001)
 *   /* → Frontend (localhost:8080)
 */

import http from 'http';
import httpProxy from 'http-proxy';
import { parse } from 'url';

// Create proxy instances
const apiProxy = httpProxy.createProxyServer();
const frontendProxy = httpProxy.createProxyServer();

// Backend server (API on port 8001)
const BACKEND_URL = 'http://localhost:8001';
// Frontend server (on port 8080)
const FRONTEND_URL = 'http://localhost:8080';

// Create the reverse proxy server
const server = http.createServer((req, res) => {
  const pathname = parse(req.url).pathname;

  // Route API requests to backend
  if (pathname.startsWith('/api/') || pathname.startsWith('/docs') || pathname.startsWith('/openapi.json')) {
    console.log(`[API] ${req.method} ${pathname} → ${BACKEND_URL}`);
    apiProxy.web(req, res, { target: BACKEND_URL });
  }
  // Route everything else to frontend
  else {
    console.log(`[Frontend] ${req.method} ${pathname} → ${FRONTEND_URL}`);
    frontendProxy.web(req, res, { target: FRONTEND_URL });
  }
});

// Error handling
apiProxy.on('error', (err, req, res) => {
  console.error('[API Error]', err.message);
  if (res && typeof res.writeHead === 'function') {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ detail: 'Backend service unavailable (port 8001 not reachable)' }));
  } else if (res && typeof res.destroy === 'function') {
    res.destroy();
  }
});

frontendProxy.on('error', (err, req, res) => {
  console.error('[Frontend Error]', err.message);
  if (res && typeof res.writeHead === 'function') {
    res.writeHead(503, { 'Content-Type': 'text/plain' });
    res.end('Frontend service unavailable');
  } else if (res && typeof res.destroy === 'function') {
    res.destroy();
  }
});

// WebSocket support
server.on('upgrade', (req, res, head) => {
  const pathname = parse(req.url).pathname;
  
  if (pathname.startsWith('/api/')) {
    apiProxy.ws(req, res, head, { target: BACKEND_URL });
  } else {
    frontendProxy.ws(req, res, head, { target: FRONTEND_URL });
  }
});

const PORT = 8000;
server.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║   🚀 JewelMind Unified Proxy Server   ║`);
  console.log(`╚════════════════════════════════════════╝\n`);
  console.log(`📱 Access your app at: http://localhost:${PORT}`);
  console.log(`\n🔄 Routes:`);
  console.log(`   /api/*  → Backend (${BACKEND_URL})`);
  console.log(`   /*      → Frontend (${FRONTEND_URL})\n`);
  console.log(`Press CTRL+C to stop\n`);
});

process.on('SIGINT', () => {
  console.log('\n\nShutting down reverse proxy...');
  server.close();
  process.exit(0);
});
