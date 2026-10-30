import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, test } from 'vitest';

import { trimRecording } from '../src/server/recording-trim';

const root = mkdtempSync(path.join(tmpdir(), 'ryugi-trim-test-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout;
}

function recording(
  name: string,
  sources: string[],
  { audio = false, offset = 0, videoDelay = 0 } = {},
) {
  const mediaPath = path.join(root, name);
  const inputs = sources.flatMap((source) => ['-f', 'lavfi', '-i', source]);
  const graph =
    sources.map((_, i) => `[${i}:v]`).join('') +
    `concat=n=${sources.length}:v=1:a=0,setpts=PTS+${videoDelay}/TB[v]`;
  run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    ...inputs,
    ...(audio ? ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=20'] : []),
    '-filter_complex',
    graph,
    '-map',
    '[v]',
    ...(audio ? ['-map', `${sources.length}:a`, '-c:a', 'libopus'] : []),
    '-c:v',
    'libvpx-vp9',
    '-lossless',
    '1',
    '-output_ts_offset',
    String(offset),
    mediaPath,
  ]);
  return mediaPath;
}

const still = (color: string, seconds: number) => `color=c=${color}:s=160x96:r=10:d=${seconds}`;
const motion = (seconds: number) => `testsrc2=s=160x96:r=10:d=${seconds}`;
const probe = (
  path: string,
): { format: { duration: string }; streams: { codec_type: string; codec_name: string }[] } =>
  JSON.parse(run('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path]));
const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

function pixel(path: string, time: number): [number, number, number] {
  const data = spawnSync('ffmpeg', [
    '-v',
    'error',
    '-ss',
    String(time),
    '-i',
    path,
    '-frames:v',
    '1',
    '-vf',
    'scale=1:1',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    'pipe:1',
  ]);
  assert.equal(data.status, 0, data.stderr?.toString());
  assert.equal(data.stdout.length, 3, 'a decoded RGB pixel is available');
  return [data.stdout[0]!, data.stdout[1]!, data.stdout[2]!];
}

test('trims idle ends with context, keeps the internal wait and audio, and preserves the source', async () => {
  // A broken interval selection would cut out the blue wait or either interaction.
  const input = recording(
    'capture with spaces; $literal.webm',
    [still('red', 5), motion(2), still('blue', 5), motion(2), still('green', 6)],
    { audio: true },
  );
  const originalHash = hash(input);
  const output = path.join(root, 'review with spaces; $literal.mp4');
  const report = await trimRecording(input, output);
  assert.ok(Math.abs(report.start - 4) < 0.15, JSON.stringify(report));
  assert.ok(Math.abs(report.end - 15) < 0.15, JSON.stringify(report));
  const media = probe(output);
  assert.ok(Math.abs(Number(media.format.duration) - 11) < 0.2);
  assert.equal(media.streams.find((stream) => stream.codec_type === 'video')?.codec_name, 'h264');
  assert.equal(media.streams.find((stream) => stream.codec_type === 'audio')?.codec_name, 'aac');
  const [r, g, b] = pixel(output, 5);
  assert.ok(b > 200 && r < 20 && g < 20, `internal wait is blue: ${[r, g, b]}`);
  assert.ok(pixel(output, 0)[0] > 200, 'one second of starting context remains');
  const final = pixel(output, 10.5);
  assert.ok(
    final[1] > 90 && final[0] < 20 && final[2] < 20,
    'one second of the final saved state remains',
  );
  assert.equal(hash(input), originalHash);
});

test('keeps small UI updates before the main interaction', async () => {
  // An 8x8 status indicator on a full HD page must not disappear into the noise floor.
  const input = recording('small-ui.webm', [
    "color=c=white:s=1920x1080:r=10:d=7,drawbox=x=100:y=100:w=8:h=8:color=black:t=fill:enable='between(t,3,4)'",
    'testsrc2=s=1920x1080:r=10:d=2',
    'color=c=green:s=1920x1080:r=10:d=4',
  ]);
  const output = path.join(root, 'small-ui.mp4');
  const report = await trimRecording(input, output);
  assert.ok(report.start <= 2.1, `small status update must remain: ${JSON.stringify(report)}`);
  assert.ok(report.end >= 10, `final state must remain: ${JSON.stringify(report)}`);
}, 30_000);

test('normalizes a recording whose timestamps start above zero', async () => {
  const input = recording('offset.webm', [still('red', 5), motion(3)], { offset: 100 });
  const output = path.join(root, 'offset.mp4');
  const report = await trimRecording(input, output);
  assert.ok(Math.abs(report.duration - 8) < 0.15, JSON.stringify(report));
  assert.ok(Math.abs(report.start - 4) < 0.15, JSON.stringify(report));
  assert.ok(Math.abs(report.end - 8) < 0.15, JSON.stringify(report));
  assert.ok(Math.abs(Number(probe(output).format.duration) - 4) < 0.2);
});

test('maps video-relative trim boundaries to a capture with earlier audio', async () => {
  const input = recording('delayed-video.webm', [still('red', 5), motion(2), still('green', 6)], {
    audio: true,
    videoDelay: 2,
  });
  const output = path.join(root, 'delayed-video.mp4');
  await trimRecording(input, output);
  const final = pixel(output, 3.5);
  assert.ok(
    final[1] > 90 && final[0] < 20 && final[2] < 20,
    `final state survives when audio starts before video: ${final}`,
  );
  assert.ok(Math.abs(Number(probe(output).format.duration) - 4) < 0.2);
});

for (const { name, sources, duration, start, end, status } of [
  { name: 'motion-only', sources: [motion(4)], duration: 4, start: 0, end: 4, status: 'unchanged' },
  {
    name: 'leading-only',
    sources: [still('red', 5), motion(3)],
    duration: 8,
    start: 4,
    end: 8,
    status: 'trimmed',
  },
  {
    name: 'trailing-only',
    sources: [motion(3), still('green', 5)],
    duration: 8,
    start: 0,
    end: 4,
    status: 'trimmed',
  },
  {
    name: 'entirely-static',
    sources: [still('blue', 5)],
    duration: 5,
    start: 0,
    end: 5,
    status: 'no-motion',
  },
  {
    name: 'short-context',
    sources: [still('red', 1), motion(2), still('green', 1)],
    duration: 4,
    start: 0,
    end: 4,
    status: 'unchanged',
  },
]) {
  test(`${name}: only idle boundaries are eligible for removal`, async () => {
    const input = recording(`${name}.webm`, sources);
    const output = path.join(root, `${name}.mp4`);
    const report = await trimRecording(input, output);
    assert.equal(report.status, status);
    assert.ok(Math.abs(report.duration - duration) < 0.15);
    assert.ok(Math.abs(report.start - start) < 0.15, JSON.stringify(report));
    assert.ok(Math.abs(report.end - end) < 0.15, JSON.stringify(report));
    assert.ok(
      Math.abs(
        Number(probe(status === 'trimmed' ? output : input).format.duration) - (end - start),
      ) < 0.2,
    );
  });
}

test('refuses to replace the source or an existing output', async () => {
  const input = recording('protected.webm', [motion(1)]);
  const originalHash = hash(input);
  const output = path.join(root, 'existing.mp4');
  writeFileSync(output, 'user-owned evidence');
  for (const destination of [input, output]) {
    await assert.rejects(trimRecording(input, destination), /new output path/i);
  }
  assert.equal(hash(input), originalHash);
  assert.equal(readFileSync(output, 'utf8'), 'user-owned evidence');
});

test('invalid input fails without leaving a partial output', async () => {
  const output = path.join(root, 'failed.mp4');
  const broken = path.join(root, 'broken.webm');
  writeFileSync(broken, 'not a video');
  await assert.rejects(trimRecording(broken, output), /ffprobe/);
  assert.equal(existsSync(output), false);
  assert.ok(readdirSync(root).every((name) => !name.startsWith('.trim-')));
});
