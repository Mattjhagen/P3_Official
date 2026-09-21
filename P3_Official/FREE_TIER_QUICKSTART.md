# P3 Lending - FREE TIER Failover Quickstart

## 🎯 Total Cost: $0-5/month (vs $20-120/month AWS)

## ⚡ 10-Minute Setup

### What You Need
- [ ] CloudFlare account (free) - [Sign up](https://dash.cloudflare.com/sign-up)
- [ ] Domain access to change nameservers
- [ ] Railway.app OR Render.com OR Fly.io account (all have free tiers)
- [ ] Your email for alerts

### Step 1: Move DNS to CloudFlare (5 minutes)

```bash
# 1. Sign up for CloudFlare: https://dash.cloudflare.com/sign-up

# 2. Add your domain: p3lending.space

# 3. CloudFlare gives you nameservers like:
#    alice.ns.cloudflare.com
#    bob.ns.cloudflare.com

# 4. Update nameservers at your registrar
#    (Where you bought p3lending.space)

# 5. Wait 5-60 minutes for DNS propagation
```

### Step 2: Automated Setup (5 minutes)

```bash
cd /home/matt/P3_Official/P3-Lending-Protocol/failover
./setup-free-tier.sh
```

The script will:
1. Ask which platform you want (Railway/Render/Fly.io)
2. Deploy your backup to that platform
3. Set up CloudFlare Worker for auto-failover
4. Configure health checks

### Step 3: Test It (2 minutes)

```bash
# Test backup is working
curl https://YOUR_BACKUP_URL/health

# Test worker is deployed
curl https://YOUR_WORKER_URL/status

# Simulate failover (turn off homelab)
# Wait 4 minutes
# Check if p3lending.space now points to backup
```

## 📊 What You Get

### Monitoring (FREE)
- ✅ Health checks every 2 minutes
- ✅ Automatic failover in 4 minutes
- ✅ Automatic failback when homelab recovers
- ✅ Email notifications
- ✅ No AWS costs!

### Platform Comparison

| Platform | Cost | Cold Start | RAM | Notes |
|----------|------|------------|-----|-------|
| **Railway** | $5 free/mo | 15s | 512MB | Best choice, auto-sleep |
| **Render** | $0 | 30s | 512MB | Free forever, slower wake |
| **Fly.io** | $0 | 10s | 256MB | Most control, faster wake |

### Recommendation: Railway.app

**Why Railway?**
- $5 free credit per month (500 hours)
- Only charges when backup is actually running
- Fastest wake-up time (15 seconds)
- PostgreSQL included
- Better than AWS for homelab failover

**Cost Example:**
- Monitoring: $0 (CloudFlare)
- Backup idle: $0 (Railway auto-sleeps)
- 4-hour outage: ~$0.80 (Railway wake time)
- 24-hour outage: ~$4.80 (within free $5 credit!)
- **Total: $0/month for typical usage**

## 🔧 Manual Setup (if script doesn't work)

### Railway Deployment

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Deploy
cd /home/matt/P3_Official/P3-Lending-Protocol
railway init
railway add postgresql
railway up

# Get your URL
railway status
```

### CloudFlare Worker

```bash
# Install Wrangler
npm install -g wrangler

# Login
wrangler login

# Deploy
cd /home/matt/P3_Official/P3-Lending-Protocol
wrangler deploy --config failover/wrangler.toml

# Set secrets
wrangler secret put CF_API_TOKEN
wrangler secret put ALERT_EMAIL
```

### CloudFlare Health Check

1. Go to CloudFlare Dashboard
2. Select your domain
3. Go to "Traffic" → "Health Checks"
4. Create new check:
   - URL: `https://p3lending.space/health`
   - Check every: 60 seconds
   - Timeout: 5 seconds
   - Retries: 2

## 📧 Email Notifications (Optional)

### Option 1: Mailgun Free Tier (Recommended)

```bash
# 1. Sign up: https://signup.mailgun.com/
# 2. Verify your domain
# 3. Get API key from dashboard
# 4. Add to Worker secrets:

wrangler secret put MAILGUN_API_KEY
wrangler secret put MAILGUN_DOMAIN
```

**Free tier:** 5,000 emails/month

### Option 2: SendGrid Free Tier

```bash
# 1. Sign up: https://signup.sendgrid.com/
# 2. Create API key
# 3. Add to Worker secrets:

wrangler secret put SENDGRID_API_KEY
```

**Free tier:** 100 emails/day

## 🧪 Testing Failover

### Test 1: Manual Health Check

```bash
# Check homelab
curl https://p3lending.space/health

# Check backup
curl https://YOUR_BACKUP_URL/health

# Check worker status
curl https://YOUR_WORKER_URL/status
```

### Test 2: Simulate Outage

```bash
# Option A: Block traffic on homelab firewall
sudo iptables -A OUTPUT -p tcp --dport 443 -j DROP

# Wait 4 minutes for failover

# Option B: Stop services
sudo systemctl stop nginx  # or whatever serves port 443

# Check DNS
dig p3lending.space

# Should show backup IP after 4 minutes
```

### Test 3: Recovery

```bash
# Restore homelab
sudo iptables -F  # Clear firewall rules
# or
sudo systemctl start nginx

# Wait 6 minutes for failback (3 successful checks)

# Verify
dig p3lending.space
# Should show homelab IP
```

## 📊 Monitoring Dashboard

### Worker Status Dashboard

Create a simple HTML page on your worker:

```javascript
// Add to cloudflare-worker.js

// Dashboard endpoint
if (url.pathname === '/dashboard') {
  const state = await getState(env)
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>P3 Failover Status</title>
        <meta http-equiv="refresh" content="30">
        <style>
          body { font-family: system-ui; max-width: 800px; margin: 50px auto; padding: 20px; }
          .status { padding: 20px; border-radius: 8px; margin: 20px 0; }
          .healthy { background: #d4edda; color: #155724; }
          .unhealthy { background: #f8d7da; color: #721c24; }
          .metric { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
        </style>
      </head>
      <body>
        <h1>🛡️ P3 Lending Failover Status</h1>
        
        <div class="status ${state.homelab_healthy ? 'healthy' : 'unhealthy'}">
          <h2>Homelab: ${state.homelab_healthy ? '✅ Healthy' : '❌ Down'}</h2>
          <p>Current Mode: <strong>${state.mode}</strong></p>
        </div>
        
        <div class="metrics">
          <div class="metric">
            <span>Last Check:</span>
            <strong>${new Date(state.last_check).toLocaleString()}</strong>
          </div>
          <div class="metric">
            <span>Consecutive Failures:</span>
            <strong>${state.consecutive_failures}</strong>
          </div>
          <div class="metric">
            <span>Consecutive Successes:</span>
            <strong>${state.consecutive_successes}</strong>
          </div>
          <div class="metric">
            <span>Total Failovers:</span>
            <strong>${state.failover_count || 0}</strong>
          </div>
          <div class="metric">
            <span>Last Failover:</span>
            <strong>${state.last_failover ? new Date(state.last_failover).toLocaleString() : 'Never'}</strong>
          </div>
          <div class="metric">
            <span>Last Failback:</span>
            <strong>${state.last_failback ? new Date(state.last_failback).toLocaleString() : 'Never'}</strong>
          </div>
        </div>
        
        <p style="margin-top: 40px; color: #666; text-align: center;">
          Auto-refreshes every 30 seconds
        </p>
      </body>
    </html>
  `
  
  return new Response(html, {
    headers: { 'Content-Type': 'text/html' }
  })
}
```

Then visit: `https://YOUR_WORKER_URL/dashboard`

## 🎓 How It Works

```
1. CloudFlare Worker checks homelab every 2 minutes
2. If homelab fails 2 consecutive checks (4 minutes):
   → Update DNS to point to Railway backup
   → Railway wakes up from sleep (15 seconds)
   → Send email notification
   → Users now hit Railway
3. When homelab recovers and passes 3 checks (6 minutes):
   → Update DNS back to homelab
   → Railway goes back to sleep
   → Send recovery notification
   → Users back on homelab
```

## 💰 Cost Breakdown

### Always Running
- CloudFlare DNS: $0
- CloudFlare Worker: $0
- Railway (sleeping): $0
- Email notifications: $0
- **Total: $0/month**

### During 4-Hour Outage
- CloudFlare: $0
- Railway active: ~$0.80
- **Total: $0.80** (vs $1.50-2.00 on AWS)

### During 24-Hour Outage
- CloudFlare: $0
- Railway active: ~$4.80
- **Total: $4.80** (vs $7-12 on AWS)

### Yearly (99% uptime)
- **Total: ~$5-10/year** (vs $20-120/year on AWS)

## ✅ Success Checklist

After setup, verify:

- [ ] CloudFlare is serving p3lending.space
- [ ] Backup URL responds to /health
- [ ] Worker status page loads
- [ ] Worker dashboard shows healthy status
- [ ] Email notifications configured
- [ ] Tested simulated outage
- [ ] Tested recovery/failback
- [ ] Monitoring dashboard accessible

## 📞 Troubleshooting

### Worker not deploying
```bash
# Check wrangler login
wrangler whoami

# Re-login if needed
wrangler logout
wrangler login

# Deploy with verbose logs
wrangler deploy --verbose
```

### Backup not waking up
```bash
# Check Railway logs
railway logs

# Check if service is deployed
railway status

# Manually trigger wake
curl https://YOUR_BACKUP_URL/health
```

### DNS not updating
```bash
# Check CloudFlare API token permissions
# Needs: Zone.DNS (Edit)

# Test API token
curl -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Check worker logs
wrangler tail
```

## 🚀 Next Steps

After failover is working:

1. **Set up uptime monitoring**: [UptimeRobot](https://uptimerobot.com/) (free)
2. **Add Slack notifications**: Create webhook and add to worker
3. **Database backup**: Set up daily PostgreSQL dumps to S3/Backblaze (free tier)
4. **Performance monitoring**: Add [Sentry](https://sentry.io/) (free tier)

---

**Congratulations!** You now have enterprise-grade failover for $0-5/month! 🎉

