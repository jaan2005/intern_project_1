// Converts an uploaded video into HLS (HTTP Live Streaming):
// many short .ts segments + playlists, in two qualities (720p and 360p) so the player
// can switch automatically depending on the viewer's internet speed.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function binary() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const bundled = require('ffmpeg-static');
    if (bundled && require('fs').existsSync(bundled)) return bundled; // only use it if the file really exists
  } catch { /* package not installed */ }
  return 'ffmpeg'; // otherwise use the FFmpeg installed on this computer
}

const run = (args) =>
  new Promise((resolve, reject) => {
    const p = spawn(binary(), args);
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => reject(new Error(`Could not start ffmpeg: ${e.message}`)));
    p.on('close', (code) => (code === 0 ? resolve(err) : reject(new Error(`ffmpeg exited with code ${code}: ${err.slice(-600)}`))));
  });

// `ffmpeg -i file` prints the file's info to stderr (and exits with an error because no output is given).
async function probe(file) {
  const info = await new Promise((resolve) => {
    let out = '';
    const p = spawn(binary(), ['-hide_banner', '-i', file]);
    p.stderr.on('data', (d) => (out += d));
    p.on('error', () => resolve(out));
    p.on('close', () => resolve(out));
  });
  const m = info.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  return {
    duration: m ? Math.round(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) : 0,
    hasVideo: /Stream #\d+:\d+.*Video:/.test(info),
    hasAudio: /Stream #\d+:\d+.*Audio:/.test(info),
  };
}

async function convertToHls(input, outDir) {
  const info = await probe(input);
  if (!info.hasVideo) throw new Error('File does not contain a video stream');

  fs.mkdirSync(path.join(outDir, 'v0'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'v1'), { recursive: true });
  const a = info.hasAudio;
  const even = (h) => `scale=-2:'trunc(min(${h},ih)/2)*2'`; // never upscale; keep dimensions even for h264

  const args = [
    '-y', '-i', input,
    '-filter_complex', `[0:v]split=2[a][b];[a]${even(720)}[v0];[b]${even(360)}[v1]`,
    '-map', '[v0]', ...(a ? ['-map', '0:a:0'] : []),
    '-map', '[v1]', ...(a ? ['-map', '0:a:0'] : []),
    '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
    '-g', '48', '-keyint_min', '48', '-sc_threshold', '0',
    '-b:v:0', '2500k', '-maxrate:v:0', '2800k', '-bufsize:v:0', '5000k',
    '-b:v:1', '800k', '-maxrate:v:1', '900k', '-bufsize:v:1', '1600k',
    ...(a ? ['-c:a', 'aac', '-b:a', '128k', '-ac', '2'] : []),
    '-f', 'hls', '-hls_time', '6', '-hls_playlist_type', 'vod', '-hls_flags', 'independent_segments',
    '-hls_segment_filename', path.join(outDir, 'v%v', 'seg_%03d.ts'),
    '-master_pl_name', 'master.m3u8',
    '-var_stream_map', a ? 'v:0,a:0 v:1,a:1' : 'v:0 v:1',
    path.join(outDir, 'v%v', 'index.m3u8'),
  ];
  await run(args);
  return { duration: info.duration };
}

module.exports = { convertToHls, probe, binary };
