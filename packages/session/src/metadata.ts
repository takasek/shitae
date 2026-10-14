export interface ModelMetadata {
  engineVersion: string;
  modelId: string;
  entryModule: string;
  sourceBasis: 'source-bytes' | 'ast';
  manifest: Array<{ module: string; sourceSha256: string; file: string | null }>;
}
