# AWS Values Needed for P3 Lending Failover

## 🎯 Quick Checklist

Run these commands to get the values you need:

### 1. AWS Account ID
```bash
aws sts get-caller-identity --query Account --output text
```
**Value:** `____________`

### 2. AWS Region
```bash
aws configure get region
```
**Recommended:** `us-east-1` (lowest cost, most services available)  
**Value:** `____________`

### 3. Route53 Hosted Zone ID
```bash
aws route53 list-hosted-zones --query 'HostedZones[?Name==`p3lending.space.`].Id' --output text
```
**Value:** `____________`

**If empty:** Domain not in Route53. Options:
- Transfer domain to Route53 (recommended, 5-7 days)
- Use subdomain `failover.p3lending.space` (faster, requires NS records)

### 4. Your Email for Alerts
**Value:** `____________`

### 5. Your Phone for SMS Alerts (Optional)
**Value:** `____________`

### 6. Homelab Public IP
```bash
curl -s https://api.ipify.org
```
**Value:** `____________`

### 7. Database Strategy

Choose one:

- [ ] **Read Replica** (~$30/month + failover) - Best reliability, no data loss
- [ ] **Daily Snapshots** (~$10/month + failover) - Good balance, 5-10 min data loss
- [ ] **No Sync** (~$1.50/month) - Cheapest, manual restore needed

**Choice:** `____________`

### 8. Homelab Database Connection
```bash
# From your P3-Lending-Protocol/.env
grep DATABASE_URL .env
```
**Value:** `postgresql://p3user:p3password@localhost:5432/p3lending`

### 9. Current Database Size
```bash
sudo -u postgres psql -d p3lending -c "SELECT pg_size_pretty(pg_database_size('p3lending'));"
```
**Value:** `____________`

### 10. Maximum Monthly Failover Budget
**Value:** `$____________`

---

## 📝 Full Deployment Command Sequence

Once you have these values, deployment is simple:

```bash
# 1. Set environment variables
export AWS_REGION="us-east-1"
export AWS_ACCOUNT_ID="123456789012"
export ALERT_EMAIL="your-email@example.com"
export HOSTED_ZONE_ID="Z1234567890ABC"
export DB_STRATEGY="read-replica"  # or "snapshot" or "none"

# 2. Bootstrap CDK (first time only)
cd /home/matt/P3_Official/P3-Lending-Protocol/failover/infrastructure
npm install
cdk bootstrap aws://${AWS_ACCOUNT_ID}/${AWS_REGION}

# 3. Deploy infrastructure
cdk deploy --all \
  --parameters AlertEmail=${ALERT_EMAIL} \
  --parameters HostedZoneId=${HOSTED_ZONE_ID} \
  --parameters DatabaseStrategy=${DB_STRATEGY}

# 4. Build and push Docker image
cd ..
./build-docker.sh

# 5. Test health check
aws lambda invoke \
  --function-name p3-health-check \
  --region ${AWS_REGION} \
  response.json

cat response.json

# 6. Monitor deployment
aws cloudwatch get-metric-statistics \
  --namespace P3Lending/Failover \
  --metric-name HomelabHealthy \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average \
  --region ${AWS_REGION}
```

---

## 🔧 AWS Agent Toolkit Setup (Optional)

The AWS Agent Toolkit enhances Claude's ability to work with AWS. To set it up:

### 1. Verify Prerequisites
```bash
# Check AWS CLI v2
aws --version  # Need 2.x

# Check Python
python3 --version  # Need 3.8+

# Check pip
pip3 --version
```

### 2. Install AWS Agent Toolkit
```bash
# Install via pip
pip3 install aws-agent-toolkit

# Or clone from GitHub
git clone https://github.com/aws/agent-toolkit-for-aws.git
cd agent-toolkit-for-aws
pip3 install -e .
```

### 3. Configure with Claude Code

The AWS Agent Toolkit is already set up as an MCP server in your Claude Code environment! You can see it in the system reminders - it provides tools like:

- `mcp__aws-mcp__aws___run_script` - Run AWS operations via Python
- Built-in modules for common AWS tasks
- Automatic pagination and error handling

**Current Status:**
```
✅ aws-mcp: Available and working
❌ miosa: AUTH_HEADER_REJECTED (token issue)
❌ robinhood-mcp-readonly: CONNECTION_CLOSED
❌ robinhood-trading: CONNECT_TIMEOUT
```

To use AWS operations in this session, I can use the `mcp__aws-mcp__aws___run_script` tool which is already configured!

### 4. Test AWS Toolkit
```bash
# I can run AWS operations directly via the MCP tool
# For example, list your EC2 instances, check RDS databases, etc.
```

---

## 🚀 What Happens Next

After you provide these values:

### Immediate (within 30 minutes)
1. ✅ CDK deploys infrastructure to AWS
2. ✅ Docker image builds and pushes to ECR
3. ✅ Health checks begin monitoring homelab
4. ✅ CloudWatch dashboard created

### Automatic (ongoing)
1. 🔍 Lambda checks homelab health every 2 minutes
2. 📊 Metrics published to CloudWatch
3. 🔔 Alerts sent via SNS/email
4. 💰 Costs ~$1.50/month in standby mode

### When Homelab Goes Down
1. ⚠️ After 3 failed checks (6 minutes), failover triggered
2. 🚀 ECS Fargate tasks start (~2 minutes)
3. 🌐 Route53 DNS updates (~1 minute)
4. ✅ p3lending.space served from AWS (~10 min total)
5. 📧 Email notification sent

### When Homelab Recovers
1. ✅ After 5 successful checks (10 minutes), failback triggered
2. 🔄 Route53 DNS switches back to homelab
3. 🛑 ECS tasks scaled to zero
4. 💰 AWS charges stop accruing
5. 📧 Recovery notification sent

---

## 💰 Cost Breakdown

### Always Running (Baseline)
- Lambda executions: $0.20/month (43,200 invocations)
- DynamoDB: $0.25/month (state storage)
- Route53 health checks: $1.00/month
- SNS notifications: $0.05/month
- **Total: ~$1.50/month**

### During 4-Hour Outage
- ECS Fargate (2 vCPU, 4GB): $0.32
- Application Load Balancer: $0.10
- Data transfer: ~$0.50
- RDS (if using): ~$0.72
- **Total: $0.92 - $1.64**

### During 24-Hour Outage
- ECS Fargate: $1.92
- Application Load Balancer: $0.60
- Data transfer: ~$3.00
- RDS (if using): ~$4.32
- **Total: $5.52 - $9.84**

### Yearly Estimate (99.9% uptime = 8.7 hours down)
- Baseline: $18/year
- Outages: $2.50-$4.00/year
- **Total: ~$20-$22/year**

---

## 📞 Need Help?

**Documentation:**
- `failover/README.md` - Complete technical documentation
- `failover/AWS_SETUP_GUIDE.md` - Step-by-step setup instructions
- `AGENT.md` - Session context and troubleshooting

**Quick Commands:**
```bash
# Check current status
aws dynamodb get-item \
  --table-name p3-failover-state \
  --key '{"id":{"S":"current"}}'

# Force failover to AWS
aws ssm put-parameter \
  --name /p3/failover/mode \
  --value "aws" \
  --overwrite

# Force failback to homelab
aws ssm put-parameter \
  --name /p3/failover/mode \
  --value "homelab" \
  --overwrite

# View logs
aws logs tail /aws/lambda/p3-health-check --follow
```

---

*Last Updated: 2026-09-21*
