# P3 Lending - High Availability Failover System

## 🎯 Overview

Automatic failover system that monitors your homelab P3 Lending service and fails over to AWS when the homelab goes offline (power outage, internet loss, hardware failure).

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AWS Cloud (Always On)                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  CloudWatch Event (every 2 minutes)                    │ │
│  │         ↓                                               │ │
│  │  Lambda Health Check Function                          │ │
│  │    - Checks homelab health endpoint                    │ │
│  │    - Tracks consecutive failures                       │ │
│  │    - Triggers failover after 3 failures (6 min)        │ │
│  └────────────────────────────────────────────────────────┘ │
│                          ↓ (if homelab down)                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Step Functions Orchestrator                           │ │
│  │    1. Deploy ECS Fargate container                     │ │
│  │    2. Wait for healthy                                 │ │
│  │    3. Update Route53 DNS                               │ │
│  │    4. Send SNS notification                            │ │
│  └────────────────────────────────────────────────────────┘ │
│                          ↓                                   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  ECS Fargate (auto-scales, pay-per-use)               │ │
│  │    - P3 Lending containers                             │ │
│  │    - Application Load Balancer                         │ │
│  │    - RDS PostgreSQL (standby replica)                  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                          ↓
                   Route53 DNS
          p3lending.space → Homelab (primary)
          p3lending.space → AWS (failover)
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                    Homelab (Primary)                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  R510 Server                                           │ │
│  │    - PostgreSQL (primary)                              │ │
│  │    - P3 Lending services                               │ │
│  │    - Health check endpoint: /health                    │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 📋 Components

### 1. Health Check Lambda (AWS)
- Runs every 2 minutes via CloudWatch Events
- Checks homelab `/health` endpoint
- Tracks consecutive failures in DynamoDB
- Triggers failover after 3 consecutive failures (6 minutes)

### 2. Failover Orchestrator (Step Functions)
- Deploys ECS Fargate service
- Updates Route53 to point to AWS ALB
- Sends SNS notifications
- Monitors homelab for recovery

### 3. ECS Fargate Service (AWS)
- Docker containers for P3 Lending app
- Auto-scaling (0-10 tasks)
- Application Load Balancer with health checks
- Only runs during outages (cost-effective)

### 4. Database Strategy
- **Option A**: RDS read replica (continuous sync, faster failover)
- **Option B**: Daily snapshots (cheaper, 5-10 min RPO)
- **Option C**: No sync (stateless, sessions lost)

### 5. Route53 DNS
- Health checks on both homelab and AWS
- Automatic DNS failover
- Low TTL (60 seconds) for fast propagation

### 6. Monitoring & Alerts
- SNS notifications to email/SMS
- CloudWatch dashboards
- Detailed logging

## 💰 Cost Estimate

### Monitoring (Always Running)
- Lambda health checks: ~$0.20/month
- CloudWatch Events: $0
- DynamoDB state table: $0.25/month
- Route53 health checks: $1.00/month
- **Total: ~$1.50/month**

### During Outage (Per Hour)
- ECS Fargate (2 vCPU, 4GB): ~$0.08/hour
- Application Load Balancer: ~$0.025/hour
- Data transfer: ~$0.09/GB
- RDS PostgreSQL (if using): ~$0.18/hour (db.t4g.small)
- **Total: ~$0.30/hour without RDS, ~$0.50/hour with RDS**

### Example Scenarios
- 4-hour power outage: $1.20-$2.00
- 24-hour internet outage: $7.20-$12.00
- 99% uptime (7 hours down/month): $2.10-$3.50

## 🚀 Deployment

### Prerequisites
1. AWS account with CLI configured
2. Domain in Route53 (or delegated subdomain)
3. Docker installed locally
4. AWS CDK installed: `npm install -g aws-cdk`

### Step 1: Build Docker Image

```bash
cd P3-Lending-Protocol/failover
./build-docker.sh
```

### Step 2: Deploy AWS Infrastructure

```bash
cd infrastructure
npm install
cdk bootstrap  # First time only
cdk deploy --all
```

This deploys:
- ECR repository for Docker images
- Lambda health check function
- Step Functions state machine
- ECS cluster and task definition
- Application Load Balancer
- Route53 health checks
- SNS notification topics
- CloudWatch alarms

### Step 3: Configure Homelab Health Endpoint

Already exists at `/health` endpoint in local-auth-server.cjs

### Step 4: Test Failover

```bash
# Simulate homelab outage
./test-failover.sh

# Check status
aws stepfunctions describe-execution --execution-arn <arn>

# Manual failover trigger
aws lambda invoke --function-name p3-failover-trigger response.json
```

## 🔄 Failover Process

### Automatic Failover (Homelab Down)
1. Lambda detects 3 consecutive health check failures (6 min)
2. Step Functions starts:
   - Scale ECS service from 0 to 2 tasks (~2 min)
   - Wait for tasks to pass health checks (~1 min)
   - Update Route53 record to AWS ALB (~1 min)
   - Send SNS alert
3. **Total failover time: ~10 minutes**

### Automatic Failback (Homelab Restored)
1. Lambda detects homelab is healthy again
2. Waits for 5 consecutive successes (10 min stability check)
3. Step Functions starts:
   - Update Route53 back to homelab
   - Scale ECS service to 0 tasks
   - Send recovery notification
4. **Total failback time: ~12 minutes after homelab recovery**

### Manual Override
```bash
# Force failover to AWS
aws ssm put-parameter --name /p3/failover/mode --value "aws" --overwrite

# Force failback to homelab
aws ssm put-parameter --name /p3/failover/mode --value "homelab" --overwrite

# Auto mode (default)
aws ssm put-parameter --name /p3/failover/mode --value "auto" --overwrite
```

## 🔧 Configuration

### Environment Variables (SSM Parameter Store)

```bash
# Set homelab endpoint
aws ssm put-parameter \
  --name /p3/homelab/endpoint \
  --value "https://p3lending.space" \
  --type String

# Set notification email
aws ssm put-parameter \
  --name /p3/alerts/email \
  --value "matt@yourdomain.com" \
  --type String

# Set database sync strategy
aws ssm put-parameter \
  --name /p3/database/strategy \
  --value "read-replica" \
  --type String  # Options: read-replica, snapshot, none
```

### Tuning Parameters

```typescript
// infrastructure/lib/config.ts
export const config = {
  healthCheck: {
    intervalMinutes: 2,          // How often to check
    consecutiveFailures: 3,       // Failures before failover
    timeout: 30000,              // Request timeout (ms)
  },
  failback: {
    consecutiveSuccesses: 5,     // Successes before failback
    stabilityMinutes: 10,        // Wait time after recovery
  },
  ecs: {
    minTasks: 0,                 // Tasks when idle
    maxTasks: 10,                // Max during load
    cpu: 2048,                   // 2 vCPU
    memory: 4096,                // 4 GB
  },
  dns: {
    ttl: 60,                     // DNS TTL in seconds
  },
};
```

## 📊 Monitoring

### CloudWatch Dashboard
```bash
# View dashboard
aws cloudwatch get-dashboard --dashboard-name P3-Failover-Status
```

Metrics tracked:
- Homelab health status (1=healthy, 0=down)
- Failover count
- Time in AWS mode
- ECS task count
- Response times
- Error rates

### Logs
```bash
# Health check logs
aws logs tail /aws/lambda/p3-health-check --follow

# Failover orchestration logs
aws logs tail /aws/states/p3-failover --follow

# Application logs
aws logs tail /ecs/p3-lending-app --follow
```

### Alerts
SNS topics created:
- `p3-homelab-down` - Homelab is offline
- `p3-failover-started` - Failover to AWS started
- `p3-failover-complete` - AWS is now serving traffic
- `p3-homelab-recovered` - Homelab is back online
- `p3-failback-complete` - Switched back to homelab

## 🔐 Security

### Network Security
- ECS tasks in private subnets
- ALB in public subnets with WAF
- Security groups restrict traffic
- VPC endpoints for AWS services

### Database Security
- RDS in private subnet
- Encryption at rest (KMS)
- Automated backups
- SSL/TLS connections only

### Secrets Management
- Database credentials in Secrets Manager
- JWT secrets in Secrets Manager
- API keys in SSM Parameter Store (encrypted)
- No secrets in environment variables

## 🧪 Testing

### Test Failover Without Disruption
```bash
# Create test stack (separate DNS record)
cd infrastructure
cdk deploy --context environment=test

# This creates test.p3lending.space pointing to AWS
# Your production homelab keeps running
```

### Chaos Engineering
```bash
# Simulate various failure scenarios
./test-scenarios/power-outage.sh      # 4 hour outage
./test-scenarios/internet-loss.sh     # ISP outage
./test-scenarios/database-failure.sh  # Database only failure
./test-scenarios/slow-homelab.sh      # Degraded performance
```

## 📝 Runbook

### Incident: Homelab Down

1. **Receive Alert**: SNS notification "Homelab Down"
2. **Automatic Response**: Failover starts automatically
3. **Verify**: Check AWS dashboard - ECS tasks starting
4. **Monitor**: Watch failover progress (~10 min)
5. **Confirm**: Test p3lending.space resolves to AWS
6. **Investigate Homelab**: Check power, internet, server status

### Incident: Failover Stuck

1. **Check Step Functions**: Look for failed steps
2. **Common Issues**:
   - ECS tasks failing health checks → Check logs
   - DNS not updating → Check Route53 permissions
   - Database unreachable → Check security groups
3. **Manual Recovery**:
   ```bash
   # Restart stuck execution
   aws stepfunctions stop-execution --execution-arn <arn>
   aws lambda invoke --function-name p3-failover-trigger response.json
   ```

### Incident: Homelab Recovered But Not Failing Back

1. **Check Health Status**:
   ```bash
   curl https://p3lending.space/health
   ```
2. **Check Consecutive Successes**: Must have 5 in a row
3. **Manual Failback**:
   ```bash
   aws ssm put-parameter --name /p3/failover/mode --value "homelab" --overwrite
   ```

## 🔄 Maintenance

### Update Application
```bash
# Build and push new Docker image
./build-docker.sh
docker tag p3-lending:latest <ecr-repo-url>:latest
docker push <ecr-repo-url>:latest

# ECS will automatically pull new image on next deployment
# During failover, latest image is used
```

### Update Infrastructure
```bash
cd infrastructure
# Make changes to CDK code
cdk diff     # Preview changes
cdk deploy   # Apply changes
```

### Database Sync
```bash
# If using read replica, monitor replication lag
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name ReplicaLag \
  --dimensions Name=DBInstanceIdentifier,Value=p3-failover-replica \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T23:59:59Z \
  --period 300 \
  --statistics Average

# If using snapshots, verify backup schedule
aws rds describe-db-snapshots --db-instance-identifier p3-homelab
```

## 🎓 Best Practices

1. **Test Monthly**: Run failover test every month
2. **Monitor Costs**: Set up billing alerts
3. **Keep Docker Updated**: Rebuild image with security patches
4. **Document Changes**: Update this README
5. **Review Logs**: Weekly log review for issues
6. **Optimize TTL**: Balance between failover speed and DNS load
7. **Database Strategy**: Choose based on RPO/RTO requirements

## 📞 Support

- **Logs**: All logs in CloudWatch Logs
- **Metrics**: CloudWatch dashboard `P3-Failover-Status`
- **Alerts**: Configured in SNS topics
- **Status**: Check DynamoDB table `p3-failover-state`

---

*Last Updated: 2026-09-21*
