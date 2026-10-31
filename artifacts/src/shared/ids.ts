import { ARTIFACT_TYPES, type ArtifactType } from './types';

const SLUG_SOURCE = '[a-z0-9][a-z0-9-]*';
// Generated IDs are 21 letters and digits. `_` and `-` stay accepted so IDs
// written before the alphabet changed keep resolving, as do the 32-character hex
// IDs from releases before stable addresses existed.
const ADDRESS_SOURCE = '(?:[\\w-]{21}|[a-f0-9]{32})';

export const ARTIFACT_LOCATOR_SOURCE = `(?:${SLUG_SOURCE}|${ADDRESS_SOURCE})`;

const ID_PATTERN = new RegExp(`^${SLUG_SOURCE}$`);
const ADDRESS_PATTERN = new RegExp(`^${ADDRESS_SOURCE}$`);

const MINT_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const MINT_LENGTH = 21;
const MINTED_PATTERN = new RegExp(`^[a-z0-9]{${MINT_LENGTH}}$`, 'i');
// 248 is the largest multiple of 62 below 256; rejecting the rest keeps every letter equally likely.
const MINT_BYTE_LIMIT = 248;

export function mintArtifactId(): string {
  let id = '';
  const bytes = new Uint8Array(MINT_LENGTH * 2);
  while (id.length < MINT_LENGTH) {
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= MINT_BYTE_LIMIT) continue;
      id += MINT_ALPHABET[byte % MINT_ALPHABET.length];
      if (id.length === MINT_LENGTH) break;
    }
  }
  return id;
}

export const isMintedArtifactId = (id: string) => MINTED_PATTERN.test(id);

export const isArtifactId = (id: string) => ID_PATTERN.test(id);

export const isArtifactAddress = (id: string) => ADDRESS_PATTERN.test(id);

// A local route takes the directory slug or the stable browser address.
export const isArtifactLocator = (id: string) => ID_PATTERN.test(id) || ADDRESS_PATTERN.test(id);

export const isArtifactType = (type: string): type is ArtifactType =>
  (ARTIFACT_TYPES as readonly string[]).includes(type);
