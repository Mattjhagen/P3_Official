#!/bin/bash
# Setup script for P3 Lending free-tier failover
# This script helps you deploy to Railway, Render, or Fly.io

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}P3 Lending Free Tier Failover${NC}"
echo -e "${GREEN}Automated Setup${NC}"
echo -e "${GREEN}================================${NC}\n"

# Check which platform to use
echo -e "${YELLOW}Which platform do you want to use for backup hosting?${NC}"
echo "1) Railway.app ($5/month free credit - Recommended)"
echo "2) Render.com (Free tier with limitations)"
echo "3) Fly.io (Free tier, more control)"
echo ""
read -p "Enter choice (1-3): " PLATFORM_CHOICE

case $PLATFORM_CHOICE in
  1)
    PLATFORM="railway"
    ;;
  2)
    PLATFORM="render"
    ;;
  3)
    PLATFORM="fly"
    ;;
  *)
    echo -e "${RED}Invalid choice${NC}"
    exit 1
    ;;
esac

echo -e "\n${GREEN}✓ Selected: $PLATFORM${NC}\n"

# Get user configuration
echo -e "${YELLOW}Please provide the following information:${NC}\n"

read -p "Your email for alerts: " ALERT_EMAIL
read -p "Your CloudFlare Zone ID (from CF dashboard): " CF_ZONE_ID
read -p "Your CloudFlare API Token (with DNS edit permissions): " CF_API_TOKEN

# Save configuration
cat > .env.failover << EOF
# P3 Lending Failover Configuration
# Generated: $(date)

# CloudFlare
CF_ZONE_ID="${CF_ZONE_ID}"
CF_API_TOKEN="${CF_API_TOKEN}"

# Alerts
ALERT_EMAIL="${ALERT_EMAIL}"

# Homelab
HOMELAB_IP="68.106.211.95"
HOMELAB_ENDPOINT="https://p3lending.space"

# Platform
BACKUP_PLATFORM="${PLATFORM}"
EOF

echo -e "\n${GREEN}✓ Configuration saved to .env.failover${NC}\n"

# Platform-specific deployment
case $PLATFORM in
  railway)
    echo -e "${BLUE}=== Railway.app Deployment ===${NC}\n"

    # Check if Railway CLI is installed
    if ! command -v railway &> /dev/null; then
      echo -e "${YELLOW}Installing Railway CLI...${NC}"
      npm install -g @railway/cli
    fi

    echo -e "${GREEN}✓ Railway CLI installed${NC}\n"

    # Login to Railway
    echo -e "${YELLOW}Please login to Railway...${NC}"
    railway login

    # Initialize project
    echo -e "${YELLOW}Creating Railway project...${NC}"
    railway init

    # Add PostgreSQL
    echo -e "${YELLOW}Adding PostgreSQL database...${NC}"
    railway add postgresql

    # Set environment variables
    echo -e "${YELLOW}Setting environment variables...${NC}"
    railway variables set ALERT_EMAIL="${ALERT_EMAIL}"
    railway variables set CF_ZONE_ID="${CF_ZONE_ID}"
    railway variables set CF_API_TOKEN="${CF_API_TOKEN}"

    # Deploy
    echo -e "${YELLOW}Deploying to Railway...${NC}"
    railway up

    # Get deployment URL
    BACKUP_URL=$(railway status --json | jq -r '.service.url')

    echo -e "\n${GREEN}✓ Railway deployment complete!${NC}"
    echo -e "${GREEN}Backup URL: ${BACKUP_URL}${NC}\n"
    ;;

  render)
    echo -e "${BLUE}=== Render.com Deployment ===${NC}\n"

    echo "Please follow these steps manually:"
    echo "1. Go to https://render.com/"
    echo "2. Click 'New +' → 'Web Service'"
    echo "3. Connect your GitHub repository"
    echo "4. Select this repository"
    echo "5. Render will auto-detect render.yaml"
    echo "6. Add environment variables:"
    echo "   - ALERT_EMAIL=${ALERT_EMAIL}"
    echo "   - CF_ZONE_ID=${CF_ZONE_ID}"
    echo "   - CF_API_TOKEN=${CF_API_TOKEN}"
    echo "7. Click 'Create Web Service'"
    echo ""
    read -p "Press Enter when deployment is complete..."
    read -p "Enter your Render.com service URL: " BACKUP_URL
    ;;

  fly)
    echo -e "${BLUE}=== Fly.io Deployment ===${NC}\n"

    # Check if flyctl is installed
    if ! command -v flyctl &> /dev/null; then
      echo -e "${YELLOW}Installing flyctl...${NC}"
      curl -L https://fly.io/install.sh | sh
      export PATH="$HOME/.fly/bin:$PATH"
    fi

    echo -e "${GREEN}✓ flyctl installed${NC}\n"

    # Login to Fly.io
    echo -e "${YELLOW}Please login to Fly.io...${NC}"
    flyctl auth login

    # Launch app
    echo -e "${YELLOW}Creating Fly.io app...${NC}"
    flyctl launch --name p3-lending-backup --region sea --no-deploy

    # Set secrets
    echo -e "${YELLOW}Setting secrets...${NC}"
    flyctl secrets set \
      ALERT_EMAIL="${ALERT_EMAIL}" \
      CF_ZONE_ID="${CF_ZONE_ID}" \
      CF_API_TOKEN="${CF_API_TOKEN}"

    # Deploy
    echo -e "${YELLOW}Deploying to Fly.io...${NC}"
    flyctl deploy

    # Get deployment URL
    BACKUP_URL=$(flyctl info --json | jq -r '.Hostname')
    BACKUP_URL="https://${BACKUP_URL}"

    echo -e "\n${GREEN}✓ Fly.io deployment complete!${NC}"
    echo -e "${GREEN}Backup URL: ${BACKUP_URL}${NC}\n"
    ;;
esac

# Save backup URL
echo "BACKUP_URL=\"${BACKUP_URL}\"" >> .env.failover

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}CloudFlare Worker Setup${NC}"
echo -e "${GREEN}================================${NC}\n"

# Update CloudFlare Worker with backup URL
sed -i "s|BACKUP_URL:.*|BACKUP_URL: '${BACKUP_URL}/health',|" failover/cloudflare-worker.js
sed -i "s|ZONE_ID:.*|ZONE_ID: '${CF_ZONE_ID}',|" failover/cloudflare-worker.js

echo -e "${YELLOW}Installing Wrangler CLI...${NC}"
if ! command -v wrangler &> /dev/null; then
  npm install -g wrangler
fi

echo -e "${GREEN}✓ Wrangler installed${NC}\n"

# Create wrangler.toml
cat > wrangler.toml << EOF
name = "p3-health-worker"
main = "failover/cloudflare-worker.js"
compatibility_date = "2024-01-01"

[env.production]
workers_dev = false
route = "failover.p3lending.space/*"

[[kv_namespaces]]
binding = "FAILOVER_STATE"
id = "CREATE_THIS_IN_CLOUDFLARE_DASHBOARD"

[triggers]
crons = ["*/2 * * * *"]

[vars]
HOMELAB_IP = "68.106.211.95"
HOMELAB_URL = "https://p3lending.space/health"
BACKUP_URL = "${BACKUP_URL}/health"
ZONE_ID = "${CF_ZONE_ID}"
RECORD_NAME = "p3lending.space"
EOF

echo -e "${YELLOW}Logging in to CloudFlare...${NC}"
wrangler login

echo -e "${YELLOW}Creating KV namespace...${NC}"
wrangler kv:namespace create "FAILOVER_STATE"

echo -e "${YELLOW}Please copy the KV namespace ID from above and update wrangler.toml${NC}"
read -p "Press Enter when done..."

echo -e "${YELLOW}Deploying Worker...${NC}"
wrangler deploy

# Set secrets
wrangler secret put CF_API_TOKEN
wrangler secret put ALERT_EMAIL

echo -e "\n${GREEN}================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${GREEN}================================${NC}\n"

echo -e "${YELLOW}Summary:${NC}"
echo -e "✓ Backup deployed to: ${BACKUP_URL}"
echo -e "✓ CloudFlare Worker deployed"
echo -e "✓ Health checks running every 2 minutes"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Test the backup: ${BACKUP_URL}/health"
echo "2. Test the worker: https://failover.p3lending.space/status"
echo "3. Simulate failover: Stop your homelab and wait 4 minutes"
echo ""
echo -e "${YELLOW}Monitoring:${NC}"
echo "- Worker logs: wrangler tail"
echo "- Worker status: https://failover.p3lending.space/status"
echo "- Manual check: https://failover.p3lending.space/check"
echo ""
echo -e "${GREEN}Total cost: $0-5/month 💰${NC}"
