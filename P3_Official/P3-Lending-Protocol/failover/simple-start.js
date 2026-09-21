#!/usr/bin/env node
/**
 * Simple backup server for P3 Lending failover
 * Just responds to health checks and shows maintenance page
 */

const http = require('http');
const PORT = process.env.PORT || 5001;

const server = http.createServer((req, res) => {
  const timestamp = new Date().toISOString();

  console.log(`[${timestamp}] ${req.method} ${req.url} - ${req.headers['user-agent'] || 'unknown'}`);

  if (req.url === '/health') {
    // Health check endpoint for CloudFlare Worker
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    });
    res.end(JSON.stringify({
      status: 'ok',
      mode: 'backup',
      timestamp,
      uptime: process.uptime()
    }));
  } else {
    // Maintenance page for any other traffic
    res.writeHead(503, {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>P3 Lending - Maintenance Mode</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: system-ui, -apple-system, sans-serif;
              background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
              color: #fff;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 20px;
            }
            .container {
              max-width: 600px;
              text-align: center;
              background: rgba(255, 255, 255, 0.05);
              backdrop-filter: blur(10px);
              border-radius: 20px;
              border: 1px solid rgba(255, 255, 255, 0.1);
              padding: 60px 40px;
            }
            h1 {
              font-size: 2.5rem;
              margin-bottom: 20px;
              background: linear-gradient(135deg, #00e599 0%, #00cc88 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
            }
            .icon {
              font-size: 4rem;
              margin-bottom: 20px;
              animation: pulse 2s ease-in-out infinite;
            }
            @keyframes pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.6; }
            }
            p {
              font-size: 1.1rem;
              line-height: 1.6;
              color: rgba(255, 255, 255, 0.8);
              margin-bottom: 15px;
            }
            .status {
              display: inline-block;
              background: rgba(255, 165, 0, 0.2);
              border: 1px solid rgba(255, 165, 0, 0.4);
              color: #ffa500;
              padding: 10px 20px;
              border-radius: 10px;
              font-weight: 600;
              margin-top: 20px;
            }
            .timestamp {
              font-size: 0.9rem;
              color: rgba(255, 255, 255, 0.5);
              margin-top: 30px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">🔧</div>
            <h1>P3 Lending</h1>
            <p><strong>Temporary Maintenance Mode</strong></p>
            <p>Our main server is temporarily offline for maintenance. We'll be back shortly!</p>
            <p>Thank you for your patience.</p>
            <div class="status">⚡ Backup Mode Active</div>
            <div class="timestamp">Server Time: ${timestamp}</div>
          </div>
        </body>
      </html>
    `);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ P3 Lending Backup Server started successfully`);
  console.log(`   Listening on: 0.0.0.0:${PORT}`);
  console.log(`   Mode: Backup/Failover`);
  console.log(`   Health Check: http://0.0.0.0:${PORT}/health`);
  console.log(`   Started at: ${new Date().toISOString()}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
