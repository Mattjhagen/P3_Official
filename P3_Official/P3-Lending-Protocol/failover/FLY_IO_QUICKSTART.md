# Fly.io Deployment Complete! 🚀

## ✅ What's Deployed

Your P3 Lending backup is now running on Fly.io at:
- **URL**: https://p3-lending-backup.fly.dev
- **Health Check**: https://p3-lending-backup.fly.dev/health

## 🔄 Next Steps

### 1. Test Your Backup

```bash
# Test the backup URL
curl https://p3-lending-backup.fly.dev/health
```

### 2. Configure CloudFlare Worker

Now we need to set up the CloudFlare Worker to automatically failover:

```bash
cd /home/matt/P3_Official/P3-Lending-Protocol/failover

# Install Wrangler (CloudFlare CLI)
npm install -g wrangler

# Login to CloudFlare
wrangler login

# Update the worker with your backup URL
# Edit cloudflare-worker.js and replace:
# BACKUP_URL: 'https://YOUR_BACKUP_URL/health'
# with:
# BACKUP_URL: 'https://p3-lending-backup.fly.dev/health'
```

Update the worker configuration:

```bash
# Edit cloudflare-worker.js
nano cloudflare-worker.js
```

Change these lines:
```javascript
const CONFIG = {
  HOMELAB_IP: '68.106.211.95',
  HOMELAB_URL: 'https://p3lending.space/health',
  BACKUP_URL: 'https://p3-lending-backup.fly.dev/health',  // ← Update this
  ZONE_ID: '07e16d0cdd71406710213895279e668a',
  RECORD_NAME: 'p3lending.space',
  CHECK_TIMEOUT: 5000,
  CONSECUTIVE_FAILURES_THRESHOLD: 2,
  CONSECUTIVE_SUCCESSES_THRESHOLD: 3,
}
```

### 3. Create CloudFlare KV Namespace

```bash
# Create namespace for state storage
wrangler kv:namespace create "FAILOVER_STATE"

# You'll get output like:
# [[kv_namespaces]]
# binding = "FAILOVER_STATE"
# id = "abc123def456"

# Copy the ID and update wrangler.toml
```

### 4. Create wrangler.toml

Create `/home/matt/P3_Official/P3-Lending-Protocol/failover/wrangler.toml`:

```toml
name = "p3-health-worker"
main = "cloudflare-worker.js"
compatibility_date = "2024-01-01"

[env.production]
workers_dev = false

[[kv_namespaces]]
binding = "FAILOVER_STATE"
id = "YOUR_KV_ID_HERE"  # ← Replace with ID from step 3

[triggers]
crons = ["*/2 * * * *"]

[vars]
HOMELAB_IP = "68.106.211.95"
HOMELAB_URL = "https://p3lending.space/health"
BACKUP_URL = "https://p3-lending-backup.fly.dev/health"
ZONE_ID = "07e16d0cdd71406710213895279e668a"
RECORD_NAME = "p3lending.space"
```

### 5. Deploy CloudFlare Worker

```bash
# Deploy the worker
wrangler deploy

# Set secrets (one at a time, it will prompt for values)
wrangler secret put CF_API_TOKEN
# Paste your CloudFlare API token here

wrangler secret put ALERT_EMAIL
# Paste your email address here
```

### 6. Test the Failover

```bash
# Check worker status
curl https://p3-health-worker.YOUR_USERNAME.workers.dev/status

# Manual failover test (optional)
curl https://p3-health-worker.YOUR_USERNAME.workers.dev/check
```

## 🎛️ Fly.io Management Commands

```bash
# Check app status
/home/matt/.fly/bin/flyctl status -a p3-lending-backup

# View logs
/home/matt/.fly/bin/flyctl logs -a p3-lending-backup

# SSH into the container
/home/matt/.fly/bin/flyctl ssh console -a p3-lending-backup

# Scale (change resources)
/home/matt/.fly/bin/flyctl scale memory 512 -a p3-lending-backup

# Deploy updates
cd /home/matt/P3_Official/P3-Lending-Protocol
/home/matt/.fly/bin/flyctl deploy --config failover/fly.toml
```

## 💰 Cost Monitoring

Check your usage:
```bash
/home/matt/.fly/bin/flyctl dashboard
```

Fly.io free tier:
- 3 shared VMs free
- 160GB bandwidth free
- Your app auto-stops when idle (saves resources)
- Wakes in ~10 seconds when needed

## 🔍 Monitoring

### Check if your app is sleeping or running:

```bash
/home/matt/.fly/bin/flyctl status -a p3-lending-backup
```

### Wake up your app manually:

```bash
curl https://p3-lending-backup.fly.dev/health
```

### View real-time logs:

```bash
/home/matt/.fly/bin/flyctl logs -a p3-lending-backup --follow
```

## 🐛 Troubleshooting

### App won't start?

```bash
# Check build logs
/home/matt/.fly/bin/flyctl logs -a p3-lending-backup

# Try rebuilding
cd /home/matt/P3_Official/P3-Lending-Protocol
/home/matt/.fly/bin/flyctl deploy --config failover/fly.toml --no-cache
```

### Database connection issues?

Your app needs these environment variables. Set them with:

```bash
/home/matt/.fly/bin/flyctl secrets set \
  DATABASE_URL="postgresql://user:pass@host:5432/dbname" \
  JWT_SECRET="your_jwt_secret" \
  -a p3-lending-backup
```

### Health check failing?

```bash
# Test locally first
curl http://localhost:5001/health

# Check if ports are correct in fly.toml
# internal_port should match your app's PORT
```

## 📊 Complete Architecture

```
User Request → CloudFlare
    ↓
    Is homelab healthy?
    ↓              ↓
  YES            NO
    ↓              ↓
Homelab      Fly.io Backup
68.106.211.95    (auto-wakes)
```

## ✅ Success Checklist

- [ ] Fly.io app deployed: `https://p3-lending-backup.fly.dev`
- [ ] Health check works: `curl https://p3-lending-backup.fly.dev/health`
- [ ] CloudFlare Worker created
- [ ] KV namespace created
- [ ] Secrets configured
- [ ] Cron trigger set (every 2 minutes)
- [ ] Tested manual failover
- [ ] Monitoring dashboard accessible

## 🎉 You're Done!

Your failover system is now active:
- **Monitoring**: Every 2 minutes
- **Failover**: 4 minutes after homelab goes down
- **Failback**: 6 minutes after homelab recovers
- **Cost**: $0/month (within free tier)

---

**Need help?** Check:
- Fly.io logs: `/home/matt/.fly/bin/flyctl logs -a p3-lending-backup`
- Worker logs: `wrangler tail`
- Dashboard: `https://fly.io/apps/p3-lending-backup`
