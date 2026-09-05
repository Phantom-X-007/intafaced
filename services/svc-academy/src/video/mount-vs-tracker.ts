/**
 * academy.video mount vs tracker honest gaps.
 *
 * Signed expiring GET + tier/stake gate. Store listing Class X n/a.
 * Unconfigured is academy.video_storage_unconfigured. Unset TTL is
 * academy.video_url_ttl_unset. Unset region (storage otherwise on) is
 * academy.video_s3_region_unset. Not LiveKit.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VIDEO_TRACKER_ID = 'academy.video' as const;

export const VIDEO_PRODUCT_SYMBOLS = [
  'listAcademyVideos',
  'grantAcademyVideoPlayback',
  'assertAcademyVideoUrlGranted',
  'assertVideoStorageConfigured',
  'assertPublishedVideoUrlTtl',
  'assertPublishedVideoS3Region',
] as const;

export const VIDEO_DONE_BAR_TEST_FILES = [
  'library.test.ts',
  'compose-pin.test.ts',
  'mount-vs-tracker.test.ts',
  'video-url-ttl-compose-pin.test.ts',
  'video-s3-region-compose-pin.test.ts',
] as const;

export const VIDEO_HONEST_GAPS = ['gap.store_listing_class_x', 'gap.transcode_path'] as const;

export function videoSymbolsInSource(): readonly (typeof VIDEO_PRODUCT_SYMBOLS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const library = readFileSync(join(here, 'library.ts'), 'utf8');
  const storage = readFileSync(join(here, 'storage.ts'), 'utf8');
  const blob = [library, storage].join('\n');
  return VIDEO_PRODUCT_SYMBOLS.filter((name) => new RegExp(`\\b${name}\\b`).test(blob));
}

export function videoHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const library = readFileSync(join(here, 'library.ts'), 'utf8');
  const storage = readFileSync(join(here, 'storage.ts'), 'utf8');
  return (
    /academy\.video_storage_unconfigured/.test(library) &&
    /academy\.video_grant_required/.test(storage) &&
    /academy\.video_url_ttl_unset/.test(storage) &&
    /academy\.video_s3_region_unset/.test(storage) &&
    /Not LiveKit/.test(library) &&
    /never lists/.test(storage)
  );
}

export function videoDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return VIDEO_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function academyVideoTrackerBackendDoneBarMet(): boolean {
  return videoSymbolsInSource().length === VIDEO_PRODUCT_SYMBOLS.length && videoHonestInSource() && videoDoneBarTestsPresent();
}

export function academyVideoMountVsTrackerBoardCard(): {
  readonly tracker: typeof VIDEO_TRACKER_ID;
  readonly symbols: number;
  readonly symbolsPresent: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const present = videoSymbolsInSource();
  return {
    tracker: VIDEO_TRACKER_ID,
    symbols: VIDEO_PRODUCT_SYMBOLS.length,
    symbolsPresent: present.length,
    gaps: VIDEO_HONEST_GAPS.length,
    backendDoneBarMet: academyVideoTrackerBackendDoneBarMet(),
  };
}
