// One interface, two backends:
//   local -> files go to server/storage and are served by Express at /media (no AWS needed for development)
//   s3    -> files go to an S3 bucket and are delivered to viewers through CloudFront
const fs = require('fs');
const path = require('path');
const env = require('../config/env');

const MIME = { '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t', '.mp4': 'video/mp4' };
const mimeOf = (f) => MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

let s3;
const getS3 = () => {
  if (!s3) {
    const { S3Client } = require('@aws-sdk/client-s3');
    // Credentials come from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in .env
    s3 = new S3Client({ region: env.aws.region });
  }
  return s3;
};

// Upload a whole local folder (the HLS output) under `prefix`.
async function putDir(localDir, prefix) {
  if (env.storage.driver === 'local') {
    const dest = path.join(env.storage.dir, prefix);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(localDir, dest, { recursive: true });
    return;
  }
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const files = walk(localDir);
  // upload 8 files at a time
  for (let i = 0; i < files.length; i += 8) {
    await Promise.all(
      files.slice(i, i + 8).map((file) => {
        const key = `${prefix}/${path.relative(localDir, file).split(path.sep).join('/')}`;
        const isPlaylist = file.endsWith('.m3u8');
        return getS3().send(
          new PutObjectCommand({
            Bucket: env.aws.bucket,
            Key: key,
            Body: fs.createReadStream(file),
            ContentType: mimeOf(file),
            CacheControl: isPlaylist ? 'public, max-age=300' : 'public, max-age=31536000, immutable',
          })
        );
      })
    );
  }
}

async function removePrefix(prefix) {
  if (!prefix) return;
  if (env.storage.driver === 'local') {
    fs.rmSync(path.join(env.storage.dir, prefix), { recursive: true, force: true });
    return;
  }
  const { ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
  let token;
  do {
    const list = await getS3().send(new ListObjectsV2Command({ Bucket: env.aws.bucket, Prefix: `${prefix}/`, ContinuationToken: token }));
    if (list.Contents?.length) {
      await getS3().send(new DeleteObjectsCommand({ Bucket: env.aws.bucket, Delete: { Objects: list.Contents.map((o) => ({ Key: o.Key })) } }));
    }
    token = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (token);
}

// The URL the browser plays. With S3 it is the CloudFront domain, not the bucket.
function publicUrl(key) {
  if (!key) return null;
  if (env.storage.driver === 'local') return `${env.publicApiUrl}/media/${key}`;
  if (env.aws.cdnUrl) return `${env.aws.cdnUrl}/${key}`;
  return `https://${env.aws.bucket}.s3.${env.aws.region}.amazonaws.com/${key}`;
}

module.exports = { putDir, removePrefix, publicUrl };
