# AWS Setup Guide for P3 Lending Failover

## 📋 Prerequisites Checklist

Before deploying the failover system, gather the following information from your AWS account:

### ✅ Required AWS Values

#### 1. AWS Account Information
```bash
# Get your AWS Account ID
aws sts get-caller-identity --query Account --output text

# Get your default region
aws configure get region

# Verify AWS CLI is configured
aws sts get-caller-identity
```

**Values Needed:**
- [ ] AWS Account ID: `____________`
- [ ] Preferred Region (e.g., us-east-1): `____________`
- [ ] AWS CLI Profile Name (if using profiles): `____________`

#### 2. Domain & DNS (Route53)
```bash
# List your Route53 hosted zones
aws route53 list-hosted-zones --query 'HostedZones[*].[Name,Id]' --output table
```

**Values Needed:**
- [ ] Domain Name: `p3lending.space`
- [ ] Route53 Hosted Zone ID: `____________`
- [ ] Current DNS record (homelab IP): `____________`

**Note:** If your domain is NOT in Route53, you'll need to either:
- **Option A:** Transfer domain to Route53 (recommended)
- **Option B:** Delegate a subdomain to Route53 (e.g., `aws.p3lending.space`)

#### 3. Notification Settings

**Values Needed:**
- [ ] Alert Email Address: `____________`
- [ ] Alert Phone Number (optional, for SMS): `____________`
- [ ] Slack Webhook URL (optional): `____________`

#### 4. Database Configuration

Choose your database strategy:

**Option A: RDS Read Replica** (Best reliability, ~$30/month + failover costs)
- Continuous replication from homelab
- Near-zero data loss
- Automatic failover

**Option B: RDS Snapshot Restore** (Lower cost, ~$10/month + failover costs)
- Daily snapshots from homelab
- 5-10 minute RPO (Recovery Point Objective)
- Cheaper but some data loss possible

**Option C: No Database Sync** (Lowest cost, only monitoring ~$1.50/month)
- Sessions/state lost during failover
- Good for stateless apps or acceptable downtime
- Manual database restore if needed

**Values Needed:**
- [ ] Database Strategy: `____________` (read-replica / snapshot / none)
- [ ] Homelab Database Connection String: `____________`
- [ ] Database Size (GB): `____________`

#### 5. VPC Configuration (Optional)

**Default:** CDK will create a new VPC automatically

**Custom VPC (if you have existing AWS infrastructure):**
```bash
# List your VPCs
aws ec2 describe-vpcs --query 'Vpcs[*].[VpcId,CidrBlock,Tags[?Key==`Name`].Value|[0]]' --output table
```

**Values Needed (if using existing VPC):**
- [ ] VPC ID: `____________`
- [ ] Private Subnet IDs: `____________`
- [ ] Public Subnet IDs: `____________`
- [ ] Security Group IDs: `____________`

#### 6. Cost & Scaling Limits

**Values Needed:**
- [ ] Maximum ECS Tasks (default: 10): `____________`
- [ ] Max Monthly Failover Budget: `$____________`
- [ ] Auto-failback enabled? (yes/no): `____________`

## 🚀 Step-by-Step Setup

### Step 1: Verify AWS CLI Configuration

```bash
# Check AWS CLI version (need v2.x)
aws --version

# If not installed, install AWS CLI v2
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure AWS CLI
aws configure
```

Enter:
- AWS Access Key ID
- AWS Secret Access Key
- Default region name (e.g., us-east-1)
- Default output format (json)

### Step 2: Install AWS CDK

```bash
# Install Node.js (if not already installed)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install AWS CDK globally
npm install -g aws-cdk

# Verify installation
cdk --version
```

### Step 3: Bootstrap AWS CDK (First Time Only)

```bash
# Bootstrap CDK in your account/region
cdk bootstrap aws://ACCOUNT-ID/REGION

# Example:
# cdk bootstrap aws://123456789012/us-east-1
```

### Step 4: Configure Domain in Route53

**If domain is already in Route53:**
```bash
# Nothing to do, skip to Step 5
```

**If domain is NOT in Route53 - Option A (Full Transfer):**
1. Go to Route53 Console → Registered Domains → Transfer Domain
2. Follow AWS wizard to transfer p3lending.space
3. Wait 5-7 days for transfer to complete

**If domain is NOT in Route53 - Option B (Subdomain Delegation):**
```bash
# Create hosted zone for subdomain
aws route53 create-hosted-zone \
    --name aws.p3lending.space \
    --caller-reference $(date +%s)

# Note the Name Servers from the output
# Add NS records to your main domain pointing to these nameservers
```

### Step 5: Set Up Database Replication (If Using)

**For Read Replica Strategy:**

```bash
# Install PostgreSQL logical replication
sudo apt-get install postgresql-contrib

# Enable logical replication in homelab PostgreSQL
# Edit /etc/postgresql/*/main/postgresql.conf:
# wal_level = logical
# max_replication_slots = 5
# max_wal_senders = 5

# Restart PostgreSQL
sudo systemctl restart postgresql

# Create replication user
sudo -u postgres psql -c "CREATE USER replication_user WITH REPLICATION PASSWORD 'secure_password';"

# Allow replication in pg_hba.conf
echo "host replication replication_user 0.0.0.0/0 md5" | sudo tee -a /etc/postgresql/*/main/pg_hba.conf

# Restart PostgreSQL
sudo systemctl restart postgresql
```

### Step 6: Create AWS Secrets

```bash
# Store database credentials
aws secretsmanager create-secret \
    --name p3/database/credentials \
    --secret-string '{"username":"p3user","password":"your_password_here"}' \
    --region us-east-1

# Store JWT secret
aws secretsmanager create-secret \
    --name p3/jwt/secret \
    --secret-string "your_jwt_secret_here" \
    --region us-east-1

# Store notification email
aws ssm put-parameter \
    --name /p3/alerts/email \
    --value "your-email@example.com" \
    --type String \
    --region us-east-1

# Store homelab endpoint
aws ssm put-parameter \
    --name /p3/homelab/endpoint \
    --value "https://p3lending.space" \
    --type String \
    --region us-east-1
```

### Step 7: Deploy Infrastructure

```bash
cd /home/matt/P3_Official/P3-Lending-Protocol/failover

# Install dependencies
npm install

# Review what will be deployed
cdk diff

# Deploy all stacks
cdk deploy --all --require-approval never

# This deploys:
# - VPC and networking
# - ECS cluster and task definition
# - Application Load Balancer
# - Lambda health check function
# - Step Functions state machine
# - CloudWatch alarms and dashboard
# - Route53 health checks
# - SNS topics for notifications
```

### Step 8: Build and Push Docker Image

```bash
cd /home/matt/P3_Official/P3-Lending-Protocol/failover
chmod +x build-docker.sh
./build-docker.sh
```

### Step 9: Test Health Check

```bash
# Invoke health check Lambda manually
aws lambda invoke \
    --function-name p3-health-check \
    --region us-east-1 \
    response.json

# Check the response
cat response.json

# View health check logs
aws logs tail /aws/lambda/p3-health-check --follow --region us-east-1
```

### Step 10: Test Failover

```bash
# Option A: Simulate homelab outage
# Temporarily block port 443 on homelab firewall

# Option B: Force failover via SSM parameter
aws ssm put-parameter \
    --name /p3/failover/mode \
    --value "aws" \
    --overwrite \
    --region us-east-1

# Watch failover progress
aws stepfunctions list-executions \
    --state-machine-arn $(aws cloudformation describe-stacks \
        --stack-name P3FailoverStack \
        --query 'Stacks[0].Outputs[?OutputKey==`FailoverStateMachineArn`].OutputValue' \
        --output text) \
    --region us-east-1

# Check ECS tasks
watch -n 5 'aws ecs list-tasks --cluster p3-lending-failover --region us-east-1'

# Test the failover endpoint
curl -I https://p3lending.space
```

### Step 11: Enable Monitoring

```bash
# Subscribe to SNS notifications
aws sns subscribe \
    --topic-arn $(aws cloudformation describe-stacks \
        --stack-name P3FailoverStack \
        --query 'Stacks[0].Outputs[?OutputKey==`AlertTopicArn`].OutputValue' \
        --output text) \
    --protocol email \
    --notification-endpoint your-email@example.com \
    --region us-east-1

# Confirm subscription via email

# View CloudWatch dashboard
aws cloudwatch get-dashboard \
    --dashboard-name P3-Failover-Status \
    --region us-east-1
```

## 📊 Post-Deployment Verification

### Verify All Components

```bash
# 1. Health Check Lambda
aws lambda get-function --function-name p3-health-check --region us-east-1

# 2. ECS Cluster
aws ecs describe-clusters --clusters p3-lending-failover --region us-east-1

# 3. Load Balancer
aws elbv2 describe-load-balancers --region us-east-1 | grep p3-lending

# 4. Route53 Health Check
aws route53 list-health-checks --region us-east-1 | grep p3lending

# 5. SNS Topics
aws sns list-topics --region us-east-1 | grep p3

# 6. State Table
aws dynamodb describe-table --table-name p3-failover-state --region us-east-1
```

### Check Current Status

```bash
# Get current failover state
aws dynamodb get-item \
    --table-name p3-failover-state \
    --key '{"id":{"S":"current"}}' \
    --region us-east-1

# Check if homelab is healthy
aws cloudwatch get-metric-statistics \
    --namespace P3Lending/Failover \
    --metric-name HomelabHealthy \
    --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
    --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
    --period 300 \
    --statistics Average \
    --region us-east-1
```

## 💰 Cost Monitoring

### Set Up Billing Alerts

```bash
# Create SNS topic for billing alerts
aws sns create-topic --name p3-billing-alerts --region us-east-1

# Subscribe to billing alerts
aws sns subscribe \
    --topic-arn arn:aws:sns:us-east-1:ACCOUNT-ID:p3-billing-alerts \
    --protocol email \
    --notification-endpoint your-email@example.com \
    --region us-east-1

# Create billing alarm (requires CloudWatch in us-east-1)
aws cloudwatch put-metric-alarm \
    --alarm-name p3-failover-monthly-cost \
    --alarm-description "Alert if P3 failover costs exceed $50/month" \
    --metric-name EstimatedCharges \
    --namespace AWS/Billing \
    --statistic Maximum \
    --period 21600 \
    --threshold 50 \
    --comparison-operator GreaterThanThreshold \
    --evaluation-periods 1 \
    --alarm-actions arn:aws:sns:us-east-1:ACCOUNT-ID:p3-billing-alerts \
    --dimensions Name=Currency,Value=USD \
    --region us-east-1
```

### View Current Costs

```bash
# Get cost and usage (last 7 days)
aws ce get-cost-and-usage \
    --time-period Start=$(date -d '7 days ago' +%Y-%m-%d),End=$(date +%Y-%m-%d) \
    --granularity DAILY \
    --metrics "UnblendedCost" \
    --filter file://cost-filter.json

# cost-filter.json:
# {
#   "Tags": {
#     "Key": "Project",
#     "Values": ["P3Failover"]
#   }
# }
```

## 🔧 Troubleshooting

### Common Issues

**Issue: CDK Bootstrap Fails**
```bash
# Check if already bootstrapped
aws cloudformation describe-stacks --stack-name CDKToolkit --region us-east-1

# If exists, update it
cdk bootstrap --force
```

**Issue: ECR Push Fails**
```bash
# Re-authenticate to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ACCOUNT-ID.dkr.ecr.us-east-1.amazonaws.com
```

**Issue: ECS Tasks Won't Start**
```bash
# Check task failures
aws ecs describe-tasks \
    --cluster p3-lending-failover \
    --tasks $(aws ecs list-tasks --cluster p3-lending-failover --query 'taskArns[0]' --output text) \
    --region us-east-1

# Check logs
aws logs tail /ecs/p3-lending-app --follow --region us-east-1
```

**Issue: DNS Not Updating**
```bash
# Check Route53 record
aws route53 list-resource-record-sets \
    --hosted-zone-id ZONE-ID \
    --query "ResourceRecordSets[?Name=='p3lending.space.']"

# Manually update DNS (emergency)
aws route53 change-resource-record-sets \
    --hosted-zone-id ZONE-ID \
    --change-batch file://dns-change.json
```

## 📞 Getting Help

If you encounter issues:

1. **Check CloudWatch Logs**: All components log to CloudWatch
2. **Review CloudFormation Events**: Shows deployment errors
3. **Check AWS Health Dashboard**: Shows AWS service issues
4. **Email Notifications**: SNS will alert on failures

**Support Resources:**
- AWS CDK Documentation: https://docs.aws.amazon.com/cdk/
- P3 Failover AGENT.md: Contains session-specific troubleshooting
- AWS Support: https://console.aws.amazon.com/support/

---

## ✅ Setup Complete!

After completing these steps, your P3 Lending platform will have:

- ✅ Automatic health monitoring every 2 minutes
- ✅ Automatic failover to AWS within 10 minutes of outage
- ✅ Automatic failback when homelab recovers
- ✅ Email notifications for all events
- ✅ CloudWatch dashboards and metrics
- ✅ Cost monitoring and alerts
- ✅ ~$1.50/month baseline cost

**Next Steps:**
1. Monitor for 1 week to ensure health checks work
2. Schedule a test failover
3. Document your runbook customizations
4. Set up database backups (if not using read replica)

---

*Last Updated: 2026-09-21*
