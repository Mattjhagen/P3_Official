# P3 Lending - Free Tier Failover Architecture

## 🎯 Goal: $0-5/month failover system

## 🆓 Cost Breakdown

### CloudFlare Free Tier (Primary Solution)
- DNS hosting: **$0**
- Health checks: **$0**
- DDoS protection: **$0**
- SSL/TLS: **$0**
- Page Rules (3 free): **$0**
- Workers (100k requests/day): **$0**
- **Total: $0/month**

### Backup Hosting Options

**Option 1: Railway.app (Recommended)**
- $5/month credit (500 hours)
- Auto-sleep when not used
- Wake on request (15 second delay)
- PostgreSQL included
- **Cost: $0-5/month** (only pay when homelab is down)

**Option 2: Render.com Free Tier**
- Free web service
- Auto-sleep after 15 min inactivity
- Wakes on request (cold start delay)
- Free PostgreSQL (90 days, then $7/month)
- **Cost: $0-7/month**

**Option 3: Fly.io Free Tier**
- 3 shared VMs free
- 160GB bandwidth free
- Auto-stop when idle
- **Cost: $0/month**

**Option 4: AWS Lambda (Free Tier)**
- 1M requests/month free
- 400,000 GB-seconds compute free
- API Gateway 1M calls free (first year)
- **Cost: $0/month first year, ~$1/month after**

### Total Monthly Cost
- **Monitoring: $0** (CloudFlare)
- **Backup hosting: $0-5** (Railway/Render/Fly.io)
- **DNS: $0** (CloudFlare)
- **Total: $0-5/month**

## 🏗️ Free Tier Architecture

```
┌─────────────────────────────────────────────────────────┐
│               CloudFlare (Always Free)                   │
│  ┌───────────────────────────────────────────────────┐  │
│  │  DNS + Health Checks                              │  │
│  │    - Checks homelab every 60 seconds              │  │
│  │    - Automatic failover to backup                 │  │
│  │    - No code required!                            │  │
│  └───────────────────────────────────────────────────┘  │
│                         ↓                                │
│  ┌───────────────────────────────────────────────────┐  │
│  │  CloudFlare Worker (Optional, Free)               │  │
│  │    - Custom failover logic                        │  │
│  │    - Email notifications via Mailgun free tier    │  │
│  │    - 100k requests/day free                       │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                         ↓
              Route Based on Health:
                         ↓
        ┌────────────────┴───────────────┐
        ↓                                ↓
┌───────────────┐              ┌─────────────────┐
│   Homelab     │              │  Railway.app    │
│   (Primary)   │              │  (Backup)       │
│               │              │                 │
│  - R510       │              │  - Free $5/mo   │
│  - Port 5001  │              │  - Auto-sleep   │
│  - Port 5173  │              │  - Wake on req  │
└───────────────┘              └─────────────────┘
```

## 🚀 Setup Guide (30 Minutes)

### Step 1: Move DNS to CloudFlare (Free)

```bash
# 1. Sign up for CloudFlare (free)
# Go to: https://dash.cloudflare.com/sign-up

# 2. Add your domain
# - Click "Add Site"
# - Enter: p3lending.space
# - Select "Free" plan

# 3. CloudFlare will give you 2 nameservers like:
#    - alice.ns.cloudflare.com
#    - bob.ns.cloudflare.com

# 4. Update nameservers at your domain registrar
#    (GoDaddy, Namecheap, etc.) to point to CloudFlare
```

**Wait time**: 15 minutes - 48 hours for DNS propagation

### Step 2: Configure CloudFlare Health Checks (Free)

```bash
# In CloudFlare Dashboard:

# 1. Go to Traffic → Health Checks
# 2. Click "Create Health Check"
# 3. Configure:
#    - Name: Homelab Health
#    - Type: HTTPS
#    - Path: /health
#    - Host: p3lending.space
#    - Port: 443
#    - Interval: 60 seconds
#    - Retries: 2
#    - Timeout: 5 seconds
#    - Check Regions: All regions (free tier)
```

### Step 3: Set Up Backup Hosting

#### Option A: Railway.app (Recommended)

```bash
# 1. Sign up: https://railway.app/
# 2. Install Railway CLI
npm install -g @railway/cli

# 3. Login
railway login

# 4. Create new project
cd /home/matt/P3_Official/P3-Lending-Protocol
railway init

# 5. Add PostgreSQL
railway add postgresql

# 6. Deploy
railway up

# Railway will give you a URL like:
# https://p3lending-production.up.railway.app
```

**Railway Config** (create `railway.json`):
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "failover/Dockerfile"
  },
  "deploy": {
    "startCommand": "/app/start.sh",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

#### Option B: Render.com (Alternative)

```bash
# 1. Sign up: https://render.com/
# 2. Create render.yaml in your project root

# 3. Deploy via GitHub:
#    - Connect GitHub repo
#    - Render auto-deploys on push
```

**Render Config** (create `render.yaml`):
```yaml
services:
  - type: web
    name: p3-lending-backup
    env: docker
    dockerfilePath: ./failover/Dockerfile
    plan: free
    autoDeploy: false
    healthCheckPath: /health
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: p3-postgres
          property: connectionString
      - key: NODE_ENV
        value: production

databases:
  - name: p3-postgres
    plan: free
    databaseName: p3lending
    user: p3user
```

#### Option C: Fly.io (Most Control)

```bash
# 1. Sign up: https://fly.io/app/sign-up
# 2. Install flyctl
curl -L https://fly.io/install.sh | sh

# 3. Login
flyctl auth login

# 4. Launch app
cd /home/matt/P3_Official/P3-Lending-Protocol
flyctl launch --name p3-lending-backup --region sea

# 5. Deploy
flyctl deploy
```

**Fly.io Config** (create `fly.toml`):
```toml
app = "p3-lending-backup"
primary_region = "sea"

[build]
  dockerfile = "failover/Dockerfile"

[env]
  NODE_ENV = "production"

[[services]]
  internal_port = 5001
  protocol = "tcp"
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[services.ports]]
  port = 443
  handlers = ["tls", "http"]

[http_service]
  internal_port = 5001
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[services.http_checks]]
  interval = "30s"
  timeout = "10s"
  grace_period = "30s"
  method = "GET"
  path = "/health"

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 256
```

### Step 4: Configure CloudFlare Load Balancer (Free Tier)

```bash
# In CloudFlare Dashboard:

# 1. Go to Traffic → Load Balancing
# 2. Create Origin Pools:

# Pool 1: Homelab (Primary)
Name: homelab-primary
Origins:
  - Address: 68.106.211.95
    Port: 443
    Health Check: Homelab Health

# Pool 2: Backup (Secondary)
Name: railway-backup
Origins:
  - Address: p3lending-production.up.railway.app
    Port: 443
    Health Check: Standard HTTPS

# 3. Create Load Balancer:
Hostname: p3lending.space
TTL: 60 seconds
Fallback Pool: railway-backup
Default Pool: homelab-primary
Steering Policy: Off (use health checks)
Session Affinity: None
```

**Note**: CloudFlare Load Balancer is $5/month. For 100% free, use DNS failover:

### Step 4 Alternative: CloudFlare DNS Failover (FREE)

```bash
# Instead of Load Balancer, use DNS records with health checks:

# 1. Create A record for homelab
Type: A
Name: @
IPv4: 68.106.211.95
TTL: 60 seconds
Proxy: Enabled (orange cloud)

# 2. Create CNAME for backup (disabled by default)
Type: CNAME
Name: backup
Target: p3lending-production.up.railway.app
TTL: 60 seconds
Proxy: Enabled

# 3. Use CloudFlare Page Rule for failover (Free Tier = 3 rules)
# This is manual failover, but you can use CloudFlare Worker for auto
```

### Step 5: CloudFlare Worker for Auto-Failover (FREE)

Create a CloudFlare Worker to automatically switch DNS when homelab is down:

```javascript
// worker.js
addEventListener('scheduled', event => {
  event.waitUntil(checkHealthAndFailover())
})

async function checkHealthAndFailover() {
  const HOMELAB_URL = 'https://68.106.211.95/health'
  const BACKUP_URL = 'https://p3lending-production.up.railway.app/health'
  const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4'
  const ZONE_ID = 'YOUR_ZONE_ID'
  const API_TOKEN = 'YOUR_API_TOKEN'
  
  // Check homelab health
  let homelabHealthy = false
  try {
    const response = await fetch(HOMELAB_URL, {
      timeout: 5000,
      headers: { 'Host': 'p3lending.space' }
    })
    homelabHealthy = response.ok
  } catch (e) {
    homelabHealthy = false
  }
  
  // Get current DNS record
  const recordsUrl = `${CLOUDFLARE_API}/zones/${ZONE_ID}/dns_records?name=p3lending.space&type=A`
  const recordsResponse = await fetch(recordsUrl, {
    headers: { 'Authorization': `Bearer ${API_TOKEN}` }
  })
  const records = await recordsResponse.json()
  const currentRecord = records.result[0]
  
  // Determine what DNS should point to
  const shouldPointToHomelab = homelabHealthy
  const isPointingToHomelab = currentRecord.content === '68.106.211.95'
  
  // Update DNS if needed
  if (shouldPointToHomelab !== isPointingToHomelab) {
    const newContent = shouldPointToHomelab 
      ? '68.106.211.95'  // Homelab IP
      : await getBackupIP()  // Railway IP (need to resolve CNAME)
    
    await fetch(`${CLOUDFLARE_API}/zones/${ZONE_ID}/dns_records/${currentRecord.id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'A',
        name: 'p3lending.space',
        content: newContent,
        ttl: 60,
        proxied: true
      })
    })
    
    // Send notification
    await sendNotification(
      shouldPointToHomelab 
        ? 'Failback to homelab complete'
        : 'Failover to backup complete'
    )
  }
}

async function getBackupIP() {
  // Resolve Railway hostname to IP
  const response = await fetch('https://dns.google/resolve?name=p3lending-production.up.railway.app&type=A')
  const data = await response.json()
  return data.Answer[0].data
}

async function sendNotification(message) {
  // Use Mailgun free tier or CloudFlare Email Workers
  await fetch('https://api.mailgun.net/v3/YOUR_DOMAIN/messages', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa('api:YOUR_MAILGUN_KEY')
    },
    body: new URLSearchParams({
      from: 'P3 Failover <failover@p3lending.space>',
      to: 'YOUR_EMAIL',
      subject: 'P3 Lending Failover Alert',
      text: message
    })
  })
}
```

Deploy the Worker:
```bash
# Install Wrangler CLI
npm install -g wrangler

# Login
wrangler login

# Create worker
wrangler init p3-health-worker

# Deploy
wrangler deploy

# Set up cron trigger (every 2 minutes)
# In CloudFlare Dashboard → Workers → Triggers → Cron Triggers
# Add: */2 * * * *
```

### Step 6: Set Up Free Email Notifications

#### Option 1: Mailgun Free Tier
- 5,000 emails/month free
- Sign up: https://signup.mailgun.com/new/signup
- Add domain and verify
- Get API key from dashboard

#### Option 2: SendGrid Free Tier
- 100 emails/day free
- Sign up: https://signup.sendgrid.com/
- Create API key
- Use in Worker

#### Option 3: CloudFlare Email Workers (Beta, Free)
- Native email sending from Workers
- No external service needed
- Request access: https://www.cloudflare.com/email/

## 📊 Cost Comparison

### AWS Solution (Original)
- Monitoring: $1.50/month
- 4-hour outage: +$1.20
- 24-hour outage: +$7.20
- **Total: $1.50-10/month**

### Free Tier Solution (New)
- Monitoring: $0 (CloudFlare)
- DNS: $0 (CloudFlare)
- Backup hosting: $0-5 (Railway free credit)
- Email: $0 (Mailgun/SendGrid free tier)
- **Total: $0-5/month**

### Savings: $18-120/year! 💰

## 🎓 Free Tier Limits

**CloudFlare Free:**
- ✅ Unlimited bandwidth
- ✅ Unlimited requests
- ✅ Basic DDoS protection
- ✅ 3 Page Rules
- ✅ Workers: 100k requests/day
- ✅ Workers Cron: 1 trigger/minute minimum
- ❌ No Load Balancer ($5/month feature)
- ❌ No Health Check analytics

**Railway Free:**
- ✅ $5 credit/month (500 execution hours)
- ✅ Auto-sleep after inactivity
- ✅ PostgreSQL included
- ✅ 100GB bandwidth
- ❌ No static IP
- ❌ Sleeps after 30 min inactivity

**Render Free:**
- ✅ 750 hours/month (full month)
- ✅ PostgreSQL 90 days free
- ✅ Auto-deploy from GitHub
- ❌ Sleeps after 15 min inactivity
- ❌ Cold start delay (15-30s)

**Fly.io Free:**
- ✅ 3 shared VMs
- ✅ 160GB bandwidth
- ✅ Auto-start/stop
- ✅ PostgreSQL with limits
- ❌ 256MB RAM limit per VM

## 🚦 Failover Speed Comparison

### AWS Solution
- Detection: 6 minutes (3 failed checks)
- ECS startup: 2-3 minutes
- DNS update: 1 minute
- **Total: ~10 minutes**

### CloudFlare + Railway
- Detection: 2 minutes (2 failed checks)
- Railway wake: 15-30 seconds
- DNS update: 60 seconds (TTL)
- **Total: ~4 minutes**

**CloudFlare is FASTER and FREE!** ⚡

## ✅ Recommended Setup

**For $0/month:**
1. CloudFlare Free (DNS + health checks)
2. Fly.io Free (backup hosting)
3. CloudFlare Worker (auto-failover)
4. SendGrid Free (email alerts)

**For $5/month:**
1. CloudFlare Free (DNS + health checks)
2. Railway.app (backup hosting with auto-sleep)
3. CloudFlare Worker (auto-failover)
4. Mailgun Free (email alerts)

## 🚀 Quick Start Script

I'll create an automated setup script next that handles all of this for you!

---

*Last Updated: 2026-09-21*
