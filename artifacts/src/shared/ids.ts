import { ARTIFACT_TYPES, type ArtifactType } from './types';

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export const isArtifactId = (id: string) => ID_PATTERN.test(id);

export const isArtifactType = (type: string): type is ArtifactType =>
  (ARTIFACT_TYPES as readonly string[]).includes(type);
