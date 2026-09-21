#!/bin/bash
# Build and push Docker image for P3 Lending failover

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🐳 Building P3 Lending Docker Image${NC}"

# Get AWS account ID and region
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region || echo "us-east-1")

# ECR repository name
ECR_REPO="p3-lending-failover"
ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"

echo -e "${YELLOW}AWS Account: ${AWS_ACCOUNT_ID}${NC}"
echo -e "${YELLOW}Region: ${AWS_REGION}${NC}"
echo -e "${YELLOW}ECR URI: ${ECR_URI}${NC}"

# Create ECR repository if it doesn't exist
echo -e "\n${GREEN}📦 Creating ECR repository...${NC}"
aws ecr describe-repositories --repository-names ${ECR_REPO} --region ${AWS_REGION} 2>/dev/null || \
    aws ecr create-repository \
        --repository-name ${ECR_REPO} \
        --region ${AWS_REGION} \
        --image-scanning-configuration scanOnPush=true \
        --encryption-configuration encryptionType=AES256

# Login to ECR
echo -e "\n${GREEN}🔐 Logging in to ECR...${NC}"
aws ecr get-login-password --region ${AWS_REGION} | \
    docker login --username AWS --password-stdin ${ECR_URI}

# Build the Docker image
echo -e "\n${GREEN}🔨 Building Docker image...${NC}"
cd /home/matt/P3_Official/P3-Lending-Protocol

docker build \
    -t p3-lending:latest \
    -t p3-lending:$(date +%Y%m%d-%H%M%S) \
    -t ${ECR_URI}:latest \
    -t ${ECR_URI}:$(date +%Y%m%d-%H%M%S) \
    -f failover/Dockerfile \
    .

# Push to ECR
echo -e "\n${GREEN}⬆️  Pushing to ECR...${NC}"
docker push ${ECR_URI}:latest
docker push ${ECR_URI}:$(date +%Y%m%d-%H%M%S)

echo -e "\n${GREEN}✅ Docker image built and pushed successfully!${NC}"
echo -e "${YELLOW}Latest tag: ${ECR_URI}:latest${NC}"
echo -e "${YELLOW}Timestamped tag: ${ECR_URI}:$(date +%Y%m%d-%H%M%S)${NC}"
