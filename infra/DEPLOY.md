# USTAAD — AWS deployment

Minimal, enough-to-qualify infrastructure: one EC2 instance running the Docker
container behind Caddy (automatic HTTPS), one S3 bucket for outputs **and** the
static frontend, and CloudWatch for logs. No DynamoDB, no Terraform.

```
Browser ──HTTPS──> Caddy ──> Docker (FastAPI + OpenCV 5) ──> S3 (outputs)
   │                                   └── logs ──> CloudWatch
   └── static site (Next.js export) ── S3 static website hosting
```

Replace the placeholders before running: `REGION`, `ACCOUNT_ID`, `BUCKET`
(globally unique), `api.example.com`, `KEYPAIR`.

---

## 0. One-time: variables

```bash
export REGION=us-east-1
export BUCKET=ustaad-demo-$(date +%s)      # must be globally unique
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
```

## 1. S3 bucket (outputs + static site)

```bash
aws s3 mb "s3://$BUCKET" --region "$REGION"
# static website hosting for the exported frontend
aws s3 website "s3://$BUCKET" --index-document index.html --error-document 404.html
```

Public read for the static site only (keep session outputs private if you prefer
by putting them under a separate prefix and narrowing this policy):

```bash
cat > /tmp/bucket-policy.json <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadStaticSite",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::$BUCKET/*"
  }]
}
JSON
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration "BlockPublicPolicy=false,RestrictPublicBuckets=false,BlockPublicAcls=true,IgnorePublicAcls=true"
aws s3api put-bucket-policy --bucket "$BUCKET" --policy file:///tmp/bucket-policy.json
```

## 2. IAM role for EC2, scoped to this one bucket

```bash
cat > /tmp/trust.json <<'JSON'
{ "Version": "2012-10-17",
  "Statement": [{ "Effect": "Allow",
    "Principal": { "Service": "ec2.amazonaws.com" },
    "Action": "sts:AssumeRole" }] }
JSON
aws iam create-role --role-name ustaad-ec2 --assume-role-policy-document file:///tmp/trust.json

cat > /tmp/policy.json <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ScopedBucketAccess",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::$BUCKET", "arn:aws:s3:::$BUCKET/*"]
    },
    {
      "Sid": "CloudWatchLogs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup", "logs:CreateLogStream",
        "logs:PutLogEvents", "logs:DescribeLogStreams"
      ],
      "Resource": "arn:aws:logs:$REGION:$ACCOUNT_ID:log-group:ustaad:*"
    }
  ]
}
JSON
aws iam put-role-policy --role-name ustaad-ec2 \
  --policy-name ustaad-scoped --policy-document file:///tmp/policy.json
aws iam create-instance-profile --instance-profile-name ustaad-ec2
aws iam add-role-to-instance-profile --instance-profile-name ustaad-ec2 --role-name ustaad-ec2
```

## 3. Launch a t3.small with Docker

```bash
# security group: allow 22, 80, 443
aws ec2 create-security-group --group-name ustaad-sg --description "USTAAD" --region "$REGION"
for p in 22 80 443; do
  aws ec2 authorize-security-group-ingress --group-name ustaad-sg \
    --protocol tcp --port $p --cidr 0.0.0.0/0 --region "$REGION"
done

# Amazon Linux 2023, install Docker + compose, create the CloudWatch log group
cat > /tmp/userdata.sh <<'SH'
#!/bin/bash
dnf update -y
dnf install -y docker
systemctl enable --now docker
usermod -aG docker ec2-user
curl -SL https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-x86_64 \
  -o /usr/local/bin/docker-compose && chmod +x /usr/local/bin/docker-compose
aws logs create-log-group --log-group-name ustaad --region REGION_PLACEHOLDER || true
SH
sed -i "s/REGION_PLACEHOLDER/$REGION/" /tmp/userdata.sh

AMI=$(aws ssm get-parameters --names \
  /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query 'Parameters[0].Value' --output text --region "$REGION")

aws ec2 run-instances --image-id "$AMI" --instance-type t3.small \
  --key-name KEYPAIR --security-groups ustaad-sg \
  --iam-instance-profile Name=ustaad-ec2 \
  --user-data file:///tmp/userdata.sh \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=ustaad}]' \
  --region "$REGION"
```

Point an A record for `api.example.com` at the instance's public IP.

## 4. Run the container with CloudWatch logging

SSH in, clone the repo (or `scp` it), then:

```bash
cd ustaad
# the awslogs driver ships container stdout/stderr to CloudWatch
docker build -t ustaad-api:latest .
docker run -d --name ustaad --restart unless-stopped \
  -p 8000:8000 \
  -e S3_BUCKET=BUCKET_PLACEHOLDER -e AWS_REGION=REGION_PLACEHOLDER \
  --log-driver=awslogs \
  --log-opt awslogs-region=REGION_PLACEHOLDER \
  --log-opt awslogs-group=ustaad \
  ustaad-api:latest
```

(Substitute `BUCKET_PLACEHOLDER` / `REGION_PLACEHOLDER`, or use docker-compose
with the `logging:` block uncommented in `docker-compose.yml`.)

## 5. Caddy for automatic HTTPS

```bash
dnf install -y caddy    # or: https://caddyserver.com/docs/install
cat > /etc/caddy/Caddyfile <<'CADDY'
api.example.com {
    reverse_proxy localhost:8000
}
CADDY
systemctl enable --now caddy
```

Caddy obtains and renews a Let's Encrypt certificate automatically. Verify:

```bash
curl https://api.example.com/health
# {"status":"ok","opencv":"5.0.0.93", ...}
```

## 6. Publish the frontend to S3

On your machine, build the static export pointing the live lab at the API, then sync:

```bash
cd web
NEXT_PUBLIC_API_URL=https://api.example.com npm run build   # emits web/out/
aws s3 sync out/ "s3://$BUCKET" --delete
```

The site is served at the S3 website endpoint (or front it with CloudFront for a
custom domain + HTTPS). To refresh the demo media/metrics, re-run
`bash pipeline/run_all.sh` locally and `aws s3 sync web/out/ s3://$BUCKET` again.

## Teardown

```bash
aws ec2 terminate-instances --instance-ids <id> --region "$REGION"
aws s3 rb "s3://$BUCKET" --force
aws iam delete-role-policy --role-name ustaad-ec2 --policy-name ustaad-scoped
aws iam remove-role-from-instance-profile --instance-profile-name ustaad-ec2 --role-name ustaad-ec2
aws iam delete-instance-profile --instance-profile-name ustaad-ec2
aws iam delete-role --role-name ustaad-ec2
```
