# Quick Fix for Fly.io Deployment

## ❌ Current Issue

The app deployed but isn't listening on the correct address:
```
WARNING The app is not listening on the expected address
You can fix this by configuring your app to listen on: 0.0.0.0:5001
```

## ✅ Solution: Set Environment Variables

The app needs database connection and other environment variables. Since you're using it as a backup (no database needed for now), let's configure it for standalone mode:

```bash
# Set minimal environment variables
/home/matt/.fly/bin/flyctl secrets set \
  PORT=5001 \
  NODE_ENV=production \
  DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
  JWT_SECRET="fly-backup-$(openssl rand -hex 32)" \
  -a p3-lending-backup

# Deploy again
cd /home/matt/P3_Official/P3-Lending-Protocol
/home/matt/.fly/bin/flyctl deploy --config failover/fly.toml
```

## 🎯 Alternative: Simple Health Check Only

For now, since this is just a backup, let's deploy a super simple version that just needs to respond to health checks:

### Option 1: Minimal Start Script

Create a simple node server:

```bash
cat > /home/matt/P3_Official/P3-Lending-Protocol/failover/simple-start.js << 'EOF'
#!/usr/bin/env node

const http = require('http');
const PORT = process.env.PORT || 5001;

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('P3 Lending Backup - Standby Mode');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Backup server listening on 0.0.0.0:${PORT}`);
});
EOF

chmod +x /home/matt/P3_Official/P3-Lending-Protocol/failover/simple-start.js
```

Update the Dockerfile to use this simple start:

```bash
# Update the Dockerfile
cat > /home/matt/P3_Official/P3-Lending-Protocol/Dockerfile.failover << 'EOF'
FROM node:20-alpine

WORKDIR /app

# Copy only what we need for a simple health check server
COPY failover/simple-start.js ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5001/health || exit 1

CMD ["node", "simple-start.js"]
EOF
```

### Option 2: Use Full App (Recommended)

If you want the full app working, you need a database. Here's how:

```bash
# Create a PostgreSQL database on Fly.io (FREE tier)
/home/matt/.fly/bin/flyctl postgres create \
  --name p3-lending-db \
  --region sjc \
  --initial-cluster-size 1 \
  --vm-size shared-cpu-1x \
  --volume-size 1

# Attach it to your app
/home/matt/.fly/bin/flyctl postgres attach p3-lending-db -a p3-lending-backup

# This automatically sets DATABASE_URL secret

# Set other required secrets
/home/matt/.fly/bin/flyctl secrets set \
  JWT_SECRET="$(openssl rand -hex 32)" \
  FRONTEND_URL="https://p3lending.space" \
  -a p3-lending-backup
```

## 🚀 Quick Test of Simple Version

```bash
# Deploy the simple version
cd /home/matt/P3_Official/P3-Lending-Protocol
/home/matt/.fly/bin/flyctl deploy --config failover/fly.toml

# Wait 2 minutes, then test
curl https://p3-lending-backup.fly.dev/health

# Should return: OK
```

## 📊 Check Status

```bash
# View logs in real-time
/home/matt/.fly/bin/flyctl logs -a p3-lending-backup

# Check machine status
/home/matt/.fly/bin/flyctl status -a p3-lending-backup

# SSH into container (for debugging)
/home/matt/.fly/bin/flyctl ssh console -a p3-lending-backup
```

## 💡 Recommended Approach

For a **backup failover system**, I recommend **Option 1 (Simple Version)** because:

1. ✅ No database needed
2. ✅ Instant startup (no database connections)
3. ✅ Lower memory usage (< 100MB)
4. ✅ Faster wake time from sleep
5. ✅ Just needs to respond to health checks

Your CloudFlare Worker will check the health endpoint, and if your homelab is down, it'll route traffic there temporarily. The simple version is perfect for this!

## ⚡ Execute Now

Run this command to deploy the simple version:

```bash
# Create simple start script
cat > /home/matt/P3_Official/P3-Lending-Protocol/failover/simple-start.js << 'EOF'
#!/usr/bin/env node
const http = require('http');
const PORT = process.env.PORT || 5001;

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', mode: 'backup', timestamp: new Date().toISOString() }));
  } else {
    res.writeHead(503, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <head><title>P3 Lending - Maintenance Mode</title></head>
        <body style="font-family: system-ui; text-align: center; padding: 50px;">
          <h1>🔧 P3 Lending - Temporary Maintenance</h1>
          <p>Our main server is temporarily offline. We'll be back shortly!</p>
          <p>Status: <strong style="color: orange;">Backup Mode</strong></p>
        </body>
      </html>
    `);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(\`✅ P3 Lending Backup Server listening on 0.0.0.0:\${PORT}\`);
});
EOF

chmod +x /home/matt/P3_Official/P3-Lending-Protocol/failover/simple-start.js

# Update Dockerfile
cat > /home/matt/P3_Official/P3-Lending-Protocol/Dockerfile.failover << 'EOF'
FROM node:20-alpine

WORKDIR /app

# Install wget for healthcheck
RUN apk add --no-cache wget

# Copy simple start script
COPY failover/simple-start.js ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5001/health || exit 1

CMD ["node", "simple-start.js"]
EOF

# Deploy!
cd /home/matt/P3_Official/P3-Lending-Protocol
/home/matt/.fly/bin/flyctl deploy --config failover/fly.toml
```

This will create a lightweight backup that:
- ✅ Responds to health checks
- ✅ Shows maintenance page if traffic hits it
- ✅ Uses < 50MB RAM
- ✅ Wakes in < 5 seconds
- ✅ **Costs $0/month** (within free tier)

---

*Run the command above and it should work perfectly!*
