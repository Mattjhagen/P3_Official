#!/bin/bash
# Gather AWS information needed for P3 Lending failover deployment

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}P3 Lending Failover Setup${NC}"
echo -e "${GREEN}AWS Information Gathering${NC}"
echo -e "${GREEN}================================${NC}\n"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI not found${NC}"
    echo "Install it: curl 'https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip' -o 'awscliv2.zip' && unzip awscliv2.zip && sudo ./aws/install"
    exit 1
fi

echo -e "${GREEN}✅ AWS CLI found${NC}\n"

# Test AWS credentials
echo -e "${YELLOW}Testing AWS credentials...${NC}"
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}❌ AWS credentials not configured${NC}"
    echo "Run: aws configure"
    exit 1
fi

echo -e "${GREEN}✅ AWS credentials valid${NC}\n"

# Gather information
echo -e "${GREEN}📋 Gathering AWS information...${NC}\n"

# 1. AWS Account ID
echo -e "${YELLOW}1. AWS Account ID:${NC}"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo -e "   ${GREEN}${AWS_ACCOUNT_ID}${NC}\n"

# 2. AWS Region
echo -e "${YELLOW}2. Current AWS Region:${NC}"
AWS_REGION=$(aws configure get region || echo "not set")
if [ "$AWS_REGION" = "not set" ]; then
    AWS_REGION="us-east-1"
    echo -e "   ${RED}Not configured, defaulting to: ${AWS_REGION}${NC}"
else
    echo -e "   ${GREEN}${AWS_REGION}${NC}"
fi
echo ""

# 3. IAM User/Role
echo -e "${YELLOW}3. IAM Identity:${NC}"
IAM_ARN=$(aws sts get-caller-identity --query Arn --output text)
echo -e "   ${GREEN}${IAM_ARN}${NC}\n"

# 4. Route53 Hosted Zones
echo -e "${YELLOW}4. Route53 Hosted Zones:${NC}"
ZONES=$(aws route53 list-hosted-zones --query 'HostedZones[*].[Name,Id]' --output text 2>/dev/null || echo "")
if [ -z "$ZONES" ]; then
    echo -e "   ${RED}❌ No hosted zones found${NC}"
    echo -e "   ${YELLOW}⚠️  You'll need to either:${NC}"
    echo -e "      - Transfer p3lending.space to Route53"
    echo -e "      - Create a subdomain delegation\n"
else
    echo "$ZONES" | while read -r name id; do
        echo -e "   ${GREEN}✓ ${name} (${id})${NC}"
        if [[ "$name" == "p3lending.space." ]]; then
            P3_ZONE_ID="${id##*/}"
            echo -e "   ${GREEN}   👆 This is your P3 domain!${NC}"
        fi
    done
    echo ""
fi

# 5. VPCs
echo -e "${YELLOW}5. Existing VPCs:${NC}"
VPCS=$(aws ec2 describe-vpcs --query 'Vpcs[*].[VpcId,CidrBlock,Tags[?Key==`Name`].Value|[0]]' --output text 2>/dev/null || echo "")
if [ -z "$VPCS" ]; then
    echo -e "   ${RED}Error querying VPCs${NC}\n"
else
    if [ "$VPCS" = "" ]; then
        echo -e "   ${YELLOW}No VPCs found - CDK will create one${NC}\n"
    else
        echo "$VPCS" | while read -r vpc_id cidr name; do
            echo -e "   ${GREEN}✓ ${vpc_id} - ${cidr} (${name:-Unnamed})${NC}"
        done
        echo ""
    fi
fi

# 6. ECR Repositories
echo -e "${YELLOW}6. ECR Repositories:${NC}"
REPOS=$(aws ecr describe-repositories --query 'repositories[*].repositoryName' --output text 2>/dev/null || echo "")
if [ -z "$REPOS" ] || [ "$REPOS" = "" ]; then
    echo -e "   ${YELLOW}No repositories found - will create p3-lending-failover${NC}\n"
else
    echo "$REPOS" | tr '\t' '\n' | while read -r repo; do
        echo -e "   ${GREEN}✓ ${repo}${NC}"
    done
    echo ""
fi

# 7. Check for existing P3 infrastructure
echo -e "${YELLOW}7. Existing P3 CloudFormation Stacks:${NC}"
STACKS=$(aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE --query 'StackSummaries[?starts_with(StackName, `P3`) || starts_with(StackName, `p3`)].StackName' --output text 2>/dev/null || echo "")
if [ -z "$STACKS" ] || [ "$STACKS" = "" ]; then
    echo -e "   ${GREEN}✓ No existing P3 stacks - clean deployment${NC}\n"
else
    echo "$STACKS" | tr '\t' '\n' | while read -r stack; do
        echo -e "   ${YELLOW}⚠️  ${stack} (already exists)${NC}"
    done
    echo ""
fi

# 8. SNS Topics
echo -e "${YELLOW}8. SNS Topics (for notifications):${NC}"
TOPICS=$(aws sns list-topics --query 'Topics[*].TopicArn' --output text 2>/dev/null || echo "")
if [ -z "$TOPICS" ] || [ "$TOPICS" = "" ]; then
    echo -e "   ${YELLOW}No topics found - will create new ones${NC}\n"
else
    P3_TOPICS=$(echo "$TOPICS" | tr '\t' '\n' | grep -i p3 || echo "")
    if [ -z "$P3_TOPICS" ]; then
        echo -e "   ${GREEN}No P3-specific topics${NC}\n"
    else
        echo "$P3_TOPICS" | while read -r topic; do
            echo -e "   ${GREEN}✓ ${topic}${NC}"
        done
        echo ""
    fi
fi

# 9. Lambda Functions
echo -e "${YELLOW}9. Lambda Functions:${NC}"
LAMBDAS=$(aws lambda list-functions --query 'Functions[?starts_with(FunctionName, `p3`)].FunctionName' --output text 2>/dev/null || echo "")
if [ -z "$LAMBDAS" ] || [ "$LAMBDAS" = "" ]; then
    echo -e "   ${GREEN}✓ No P3 Lambda functions - clean deployment${NC}\n"
else
    echo "$LAMBDAS" | tr '\t' '\n' | while read -r func; do
        echo -e "   ${YELLOW}⚠️  ${func} (already exists)${NC}"
    done
    echo ""
fi

# 10. Check CDK Bootstrap
echo -e "${YELLOW}10. CDK Bootstrap Status:${NC}"
CDK_STACK=$(aws cloudformation describe-stacks --stack-name CDKToolkit --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NOT_FOUND")
if [ "$CDK_STACK" = "NOT_FOUND" ]; then
    echo -e "   ${RED}❌ CDK not bootstrapped${NC}"
    echo -e "   ${YELLOW}   Run: cdk bootstrap aws://${AWS_ACCOUNT_ID}/${AWS_REGION}${NC}\n"
else
    echo -e "   ${GREEN}✓ CDK bootstrapped (${CDK_STACK})${NC}\n"
fi

# Get homelab info
echo -e "${YELLOW}11. Homelab Information:${NC}"
HOMELAB_IP=$(curl -s https://api.ipify.org 2>/dev/null || echo "Unable to detect")
echo -e "   Public IP: ${GREEN}${HOMELAB_IP}${NC}"

# Check database
DB_SIZE=$(sudo -u postgres psql -d p3lending -t -c "SELECT pg_size_pretty(pg_database_size('p3lending'));" 2>/dev/null | xargs || echo "Unable to detect")
echo -e "   Database Size: ${GREEN}${DB_SIZE}${NC}\n"

# Summary
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Summary${NC}"
echo -e "${GREEN}================================${NC}\n"

cat > /tmp/p3-aws-values.env << EOF
# P3 Lending Failover Configuration
# Generated: $(date)

# AWS Account Details
export AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID}"
export AWS_REGION="${AWS_REGION}"

# Homelab Details
export HOMELAB_PUBLIC_IP="${HOMELAB_IP}"
export HOMELAB_ENDPOINT="https://p3lending.space"
export DATABASE_SIZE="${DB_SIZE}"

# Deployment Configuration
export ALERT_EMAIL="YOUR_EMAIL_HERE"
export ALERT_PHONE="" # Optional: +1234567890
export DB_STRATEGY="snapshot" # Options: read-replica, snapshot, none
export MAX_MONTHLY_BUDGET="50" # Maximum $ to spend on failover per month

# Route53 (Update with your hosted zone ID if found)
export HOSTED_ZONE_ID="REPLACE_WITH_YOUR_ZONE_ID"

# CDK Bootstrap Required: ${CDK_STACK}
EOF

echo -e "${GREEN}✅ Configuration saved to: /tmp/p3-aws-values.env${NC}\n"
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Edit /tmp/p3-aws-values.env and fill in:"
echo "   - ALERT_EMAIL"
echo "   - HOSTED_ZONE_ID (if you have p3lending.space in Route53)"
echo "   - DB_STRATEGY preference"
echo ""
echo "2. Source the file:"
echo "   source /tmp/p3-aws-values.env"
echo ""
echo "3. Deploy infrastructure:"
echo "   cd /home/matt/P3_Official/P3-Lending-Protocol/failover/infrastructure"
echo "   npm install"
if [ "$CDK_STACK" = "NOT_FOUND" ]; then
    echo "   cdk bootstrap aws://\${AWS_ACCOUNT_ID}/\${AWS_REGION}"
fi
echo "   cdk deploy --all"
echo ""
echo "4. Build Docker image:"
echo "   cd /home/matt/P3_Official/P3-Lending-Protocol/failover"
echo "   ./build-docker.sh"
echo ""

cat /tmp/p3-aws-values.env
