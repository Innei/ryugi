const minorOf = (version: string | null) => /^(\d+)\.(\d+)\./.exec(version ?? '')?.slice(1, 3).join('.') ?? null;

export function editableAcross(viewer: string, host: string | null) {
  const mine = minorOf(viewer);
  return mine !== null && mine === minorOf(host);
}

export const versionReason = (viewer: string, host: string | null) =>
  `电脑上的 ryugi 是 ${host ?? '未知版本'}，网页是 ${viewer}，版本对上之前只能评论`;
