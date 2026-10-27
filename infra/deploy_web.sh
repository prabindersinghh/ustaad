#!/usr/bin/env bash
set -euo pipefail

REGION="ap-south-1"
BUCKET="ustaad-demo-$(od -An -N4 -tu4 /dev/urandom | tr -d ' ')"
WEBSITE="http://${BUCKET}.s3-website.${REGION}.amazonaws.com"

aws s3api create-bucket \
  --bucket "$BUCKET" \
  --region "$REGION" \
  --create-bucket-configuration LocationConstraint="$REGION"

aws s3api put-public-access-block \
  --bucket "$BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false

aws s3 website "s3://$BUCKET" --index-document index.html --error-document 404.html

POLICY=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadForWebsiteObjectsOnly",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::$BUCKET/*"
  }]
}
JSON
)
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "$POLICY"
aws s3 sync web/out "s3://$BUCKET" --delete

echo "Bucket: $BUCKET"
echo "Website: $WEBSITE"
