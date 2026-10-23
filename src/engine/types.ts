import type { OutFormat, ToolSlug } from '../tools';

export type Note = 'gps-removed' | 'first-frame-only' | 'already-optimized' | 'transparency-filled';
export type FailReason = 'wrong-type' | 'corrupt' | 'too-large' | 'oom' | 'codec-load';

export interface Job {
  id: string;
  file: File;
  tool: ToolSlug;
  options: { format?: OutFormat; quality?: number; downscaleTo?: number };
}

export interface Done {
  id: string;
  blob: Blob;
  name: string;
  width: number;
  height: number;
  inBytes: number;
  outBytes: number;
  notes: Note[];
}

export interface Failed {
  id: string;
  reason: FailReason;
  detectedType?: string;
  megapixels?: number;
}

export interface Progress {
  id: string;
  stage: 'loading-codec' | 'decoding' | 'encoding';
  loaded?: number;
  total?: number;
}

export const MAX_MEGAPIXELS = 50;
export const DOWNSCALE_MEGAPIXELS = 24;
