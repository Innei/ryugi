import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface TrimResult {
  duration: number;
  end: number;
  removed: number;
  start: number;
  status: 'trimmed' | 'unchanged' | 'no-motion';
}

function run(command: string, args: string[], signal?: AbortSignal) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(
      command,
      args,
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120_000, signal },
      (error, stdout, stderr) => {
        if (error)
          reject(
            new Error(
              (error as NodeJS.ErrnoException).code === 'ENOENT'
                ? `${command} is unavailable; install FFmpeg to enable automatic recording preparation`
                : `${command}: ${stderr.trim() || error.message}`,
            ),
          );
        else resolve({ stdout, stderr });
      },
    );
  });
}

// Processing runs in child processes, never on the server's event loop. The
// caller supplies an immutable capture and owns the output/cache lifecycle.
export async function trimRecording(
  input: string,
  output: string,
  signal?: AbortSignal,
): Promise<TrimResult> {
  if (input === output || fs.existsSync(output))
    throw new Error('Choose a new output path; existing files are never overwritten.');
  const probe = JSON.parse(
    (
      await run(
        'ffprobe',
        ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', input],
        signal,
      )
    ).stdout,
  );
  const video = probe.streams.find(
    (stream: { codec_type: string }) => stream.codec_type === 'video',
  );
  if (!video) throw new Error('The recording has no video stream');
  const delay = Number(video.start_time) - Number(probe.format.start_time);
  const seekOffset = Number.isFinite(delay) ? Math.max(0, delay) : 0;
  const analysis = await run(
    'ffmpeg',
    [
      '-hide_banner',
      '-nostdin',
      '-nostats',
      '-i',
      input,
      '-map',
      '0:v:0',
      '-vf',
      'setpts=PTS-STARTPTS,freezedetect=n=0:d=2',
      '-an',
      '-sn',
      '-dn',
      '-progress',
      'pipe:1',
      '-f',
      'null',
      '-',
    ],
    signal,
  );
  // Matroska's duration may include a nonzero capture timestamp. Measure the
  // decoded video timeline instead. n=0 preserves even very small UI changes.
  const elapsed = [...analysis.stdout.matchAll(/^out_time_us=(\d+)$/gm)].at(-1);
  const duration = Number(elapsed?.[1]) / 1_000_000;
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error('Cannot determine the decoded recording duration');
  const freezes: { start: number; end: number }[] = [];
  for (const match of analysis.stderr.matchAll(
    /lavfi\.freezedetect\.freeze_(start|end): ([\d.e+-]+)/g,
  )) {
    const time = Number(match[2]);
    if (!Number.isFinite(time)) throw new Error('Invalid freeze timestamp');
    if (match[1] === 'start') freezes.push({ start: time, end: duration });
    else if (freezes.length) freezes.at(-1)!.end = time;
  }
  let start = 0;
  let end = duration;
  let status: TrimResult['status'] = 'unchanged';
  const first = freezes[0];
  const last = freezes.at(-1);
  if (first?.start === 0 && first.end >= duration) status = 'no-motion';
  else {
    if (first?.start === 0) start = Math.max(0, first.end - 1);
    if (last?.end === duration) end = Math.min(duration, last.start + 1);
    if (end <= start) throw new Error('No safe continuous recording interval');
    if (start > 0 || end < duration) status = 'trimmed';
  }
  if (status === 'trimmed') {
    const temporary = fs.mkdtempSync(path.join(path.dirname(output), '.trim-'));
    try {
      const encoded = path.join(temporary, 'clip.mp4');
      await run(
        'ffmpeg',
        [
          '-hide_banner',
          '-nostdin',
          '-loglevel',
          'error',
          '-ss',
          String(start + seekOffset),
          '-i',
          input,
          '-t',
          String(end - start),
          '-map',
          '0:v:0',
          '-map',
          '0:a:0?',
          '-c:v',
          'libx264',
          '-crf',
          '18',
          '-preset',
          'fast',
          '-pix_fmt',
          'yuv420p',
          '-vf',
          'pad=ceil(iw/2)*2:ceil(ih/2)*2',
          '-c:a',
          'aac',
          '-movflags',
          '+faststart',
          encoded,
        ],
        signal,
      );
      fs.linkSync(encoded, output);
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }
  return { duration, start, end, removed: duration - (end - start), status };
}
