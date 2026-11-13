# AWS setup: S3 + CloudFront

Everything here fits in the AWS free tier for a project this size. **Set a billing alert first** (Billing, Budgets, create a budget of $5).

## 1. S3 bucket
1. S3, Create bucket, name e.g. `lumen-academy-videos-<yourname>`, region `ap-south-1` (Mumbai) or the nearest to you.
2. Keep **Block all public access = ON**. CloudFront will read the bucket privately.

## 2. IAM user for the API/worker
1. IAM, Users, Create user `lms-uploader`, no console access.
2. Attach an inline policy (replace the bucket name):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["s3:PutObject", "s3:DeleteObject"], "Resource": "arn:aws:s3:::YOUR-BUCKET/*" },
    { "Effect": "Allow", "Action": ["s3:ListBucket"], "Resource": "arn:aws:s3:::YOUR-BUCKET" }
  ]
}
```
3. Security credentials, Create access key (use case "Application running outside AWS"). Copy both values now.

## 3. CloudFront distribution
1. CloudFront, Create distribution, origin = your S3 bucket.
2. Origin access: **Origin access control (OAC)**, create a new one.
3. Viewer protocol: Redirect HTTP to HTTPS. Cache policy: **CachingOptimized**.
4. **Response headers policy: `Managed-SimpleCORS`.** Without this the browser blocks hls.js with a CORS error.
5. Create. CloudFront shows a banner with a **bucket policy**: copy it and paste it into S3, your bucket, Permissions, Bucket policy.
6. Wait until the distribution status is *Deployed* (about 5 minutes). Copy the domain, e.g. `https://d1234abcd.cloudfront.net`.

## 4. Configure the server
In `server/.env`:
```
STORAGE_DRIVER=s3
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET=lumen-academy-videos-<yourname>
CLOUDFRONT_URL=https://d1234abcd.cloudfront.net
```
Restart the API **and the worker** (both read `.env`). Upload a lesson video: you should see
`videos/<lessonId>/<random>/master.m3u8` appear in the bucket, and the video plays from the CloudFront domain
(check the Network tab in the browser).

## 5. After the project
Delete the CloudFront distribution (disable first, then delete), empty and delete the bucket, and delete the IAM access key.

## Troubleshooting
- **403 on the video:** the bucket policy from step 3.5 was not applied, or the distribution is still deploying.
- **CORS error in the console:** the SimpleCORS response headers policy is missing (step 3.4).
- **Worker says AccessDenied:** wrong keys or bucket name in `.env`, or the IAM policy resource is wrong.
