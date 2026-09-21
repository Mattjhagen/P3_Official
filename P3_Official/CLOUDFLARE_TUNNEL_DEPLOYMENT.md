# P3 Lending - Cloudflare Tunnel Deployment Guide

## 🌐 Deploy p3lending.space with Cloudflare Tunnel

This guide shows you how to expose your local P3 Lending services to the internet using Cloudflare Tunnel at **p3lending.space**.

---

## 📊 Services Overview

| Service | Local Port | Public Domain |
|---------|-----------|---------------|
| **P3 Lending Protocol** (Main App) | 5173 | https://p3lending.space |
| **P3 Admin Dashboard** | 5174 | https://admin.p3lending.space |
| **Authentication API** | 5001 | https://api.p3lending.space |
| **PostgreSQL** | 5432 | (Internal only) |
| **Mailhog (Email Testing)** | 8025 | https://mail.p3lending.space (optional) |

---

## 🚀 Quick Start

### 1. Install Cloudflare Tunnel (cloudflared)

```bash
# Download and install
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Verify installation
cloudflared --version
```

### 2. Login to Cloudflare

```bash
cloudflared tunnel login
```

This will open a browser and ask you to select your Cloudflare account and domain (p3lending.space).

### 3. Create a Tunnel

```bash
# Create tunnel named "p3lending"
cloudflared tunnel create p3lending

# Note the Tunnel ID that's displayed (you'll need this)
```

### 4. Configure DNS

Add these DNS records in your Cloudflare dashboard for p3lending.space:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| CNAME | @ | <TUNNEL_ID>.cfargotunnel.com | Proxied |
| CNAME | admin | <TUNNEL_ID>.cfargotunnel.com | Proxied |
| CNAME | api | <TUNNEL_ID>.cfargotunnel.com | Proxied |
| CNAME | mail | <TUNNEL_ID>.cfargotunnel.com | Proxied |

Or use the CLI:

```bash
# Main domain
cloudflared tunnel route dns p3lending p3lending.space

# Subdomains
cloudflared tunnel route dns p3lending admin.p3lending.space
cloudflared tunnel route dns p3lending api.p3lending.space
cloudflared tunnel route dns p3lending mail.p3lending.space
```

### 5. Create Tunnel Configuration

Create `/home/matt/.cloudflared/config.yml`:

```yaml
tunnel: p3lending
credentials-file: /home/matt/.cloudflared/<TUNNEL_ID>.json

ingress:
  # Main P3 Lending App
  - hostname: p3lending.space
    service: http://localhost:5173
    originRequest:
      noTLSVerify: true
      
  # Admin Dashboard
  - hostname: admin.p3lending.space
    service: http://localhost:5174
    originRequest:
      noTLSVerify: true
      
  # Authentication API
  - hostname: api.p3lending.space
    service: http://localhost:5001
    originRequest:
      noTLSVerify: true
      
  # Mailhog Email UI (optional)
  - hostname: mail.p3lending.space
    service: http://localhost:8025
    originRequest:
      noTLSVerify: true
      
  # Catch-all rule (required)
  - service: http_status:404
```

Replace `<TUNNEL_ID>` with your actual tunnel ID.

### 6. Test Configuration

```bash
cloudflared tunnel --config /home/matt/.cloudflared/config.yml ingress validate
```

### 7. Run the Tunnel

```bash
# Test run (foreground)
cloudflared tunnel --config /home/matt/.cloudflared/config.yml run p3lending

# If successful, press Ctrl+C and continue to install as a service
```

### 8. Install as System Service

```bash
# Install the service
sudo cloudflared service install

# Enable and start
sudo systemctl enable cloudflared
sudo systemctl start cloudflared

# Check status
sudo systemctl status cloudflared
```

---

## ✅ Verification

Visit these URLs to verify everything is working:

1. **https://p3lending.space** - Main lending platform
2. **https://admin.p3lending.space** - Admin dashboard
3. **https://api.p3lending.space/health** - API health check
4. **https://mail.p3lending.space** - Email inbox (Mailhog)

---

## 🔧 Update Environment Variables

Update your environment files for production:

### P3-Lending-Protocol/.env

```env
# Production URLs
VITE_SUPABASE_URL=https://api.p3lending.space
VITE_SUPABASE_ANON_KEY=local_development_anon_key_placeholder_20chars
VITE_BACKEND_URL=https://api.p3lending.space
VITE_API_BASE_URL=https://api.p3lending.space

# Keep local database
DATABASE_URL=postgresql://p3user:p3password@localhost:5432/p3lending
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=p3lending
POSTGRES_USER=p3user
POSTGRES_PASSWORD=p3password

# Local Email (Mailhog)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_FROM=noreply@p3lending.space
SMTP_SECURE=false

# OAuth (Add when ready)
VITE_GOOGLE_CLIENT_ID=your_google_client_id
VITE_APPLE_CLIENT_ID=your_apple_client_id

# Production mode
NODE_ENV=production
```

---

## 🔒 Security Considerations

### 1. Enable HTTPS Only
In Cloudflare dashboard:
- SSL/TLS → Overview → Set to "Full (strict)"
- SSL/TLS → Edge Certificates → Enable "Always Use HTTPS"

### 2. Add Rate Limiting
```bash
# In Cloudflare dashboard:
# Security → WAF → Rate Limiting Rules
# Add rules to protect:
# - /api/auth/login (5 requests per minute)
# - /api/auth/register (3 requests per minute)
```

### 3. Enable DDoS Protection
- Enable Cloudflare's automatic DDoS protection
- Set challenge pages for suspicious traffic

### 4. Database Security
- Keep PostgreSQL on localhost ONLY
- Never expose port 5432 to the internet
- All database access goes through the API

### 5. Update JWT Secret
```bash
# Generate a secure secret
openssl rand -hex 32

# Update local-auth-server.cjs
JWT_SECRET='your_generated_secret_here'
```

---

## 📱 CORS Configuration

Update CORS in `local-auth-server.cjs`:

```javascript
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://p3lending.space',
    'https://admin.p3lending.space'
  ],
  credentials: true
}));
```

---

## 🔄 Restart Services for Production

```bash
# Stop development servers
# Then start in production mode

# 1. Start Auth API
cd /home/matt/P3_Official/P3-Lending-Protocol
NODE_ENV=production node local-auth-server.cjs &

# 2. Build and serve main app
npm run build
npx vite preview --host --port 5173 &

# 3. Build and serve admin
cd /home/matt/P3_Official/P3admin
npm run build
npx vite preview --host --port 5174 &
```

Or use PM2 for process management:

```bash
# Install PM2
npm install -g pm2

# Start services
pm2 start local-auth-server.cjs --name p3-auth
pm2 start "npm run preview -- --host --port 5173" --name p3-main
pm2 start "npm run preview -- --host --port 5174" --name p3-admin --cwd /home/matt/P3_Official/P3admin

# Save configuration
pm2 save
pm2 startup
```

---

## 📊 Monitoring

### View Cloudflare Tunnel Logs
```bash
sudo journalctl -u cloudflared -f
```

### View Application Logs
```bash
# Auth API
pm2 logs p3-auth

# Main App
pm2 logs p3-main

# Admin Dashboard
pm2 logs p3-admin
```

### Database Connections
```bash
docker exec -it p3-postgres psql -U p3user -d p3lending -c "SELECT count(*) FROM auth.users;"
```

---

## 🔄 Continuous Deployment

Create a deployment script at `/home/matt/P3_Official/deploy.sh`:

```bash
#!/bin/bash

echo "🚀 Deploying P3 Lending Platform"

# Navigate to main app
cd /home/matt/P3_Official/P3-Lending-Protocol

# Pull latest changes (if using git)
git pull

# Install dependencies
npm install

# Build
npm run build

# Navigate to admin
cd /home/matt/P3_Official/P3admin
npm install
npm run build

# Restart services
pm2 restart all

echo "✅ Deployment complete!"
echo "🌐 Visit https://p3lending.space"
```

Make it executable:
```bash
chmod +x /home/matt/P3_Official/deploy.sh
```

---

## 🐛 Troubleshooting

### Tunnel Not Connecting
```bash
# Check tunnel status
cloudflared tunnel list

# Test DNS
nslookup p3lending.space

# Check tunnel logs
sudo journalctl -u cloudflared -n 50
```

### 502 Bad Gateway
```bash
# Check if services are running
curl http://localhost:5173
curl http://localhost:5174
curl http://localhost:5001/health

# Restart services if needed
pm2 restart all
```

### Database Connection Errors
```bash
# Check PostgreSQL
docker ps | grep postgres

# Restart if needed
docker restart p3-postgres
```

---

## 📞 Support Resources

- **Cloudflare Tunnel Docs**: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
- **Cloudflare Community**: https://community.cloudflare.com/
- **P3 Lending GitHub**: https://github.com/Mattjhagen/P3-Lending-Protocol

---

## ✅ Deployment Checklist

- [ ] Cloudflared installed and authenticated
- [ ] Tunnel created: `p3lending`
- [ ] DNS records configured
- [ ] Configuration file created
- [ ] Services built for production
- [ ] Environment variables updated
- [ ] CORS configured
- [ ] JWT secret changed
- [ ] Cloudflare security enabled
- [ ] SSL/TLS set to "Full (strict)"
- [ ] Rate limiting configured
- [ ] Services running via PM2
- [ ] Tunnel installed as system service
- [ ] Verified all URLs are accessible
- [ ] Monitoring set up

---

**🎉 Your P3 Lending Platform is now live at https://p3lending.space!**
