/**
 * Named VOD spine — the media half of the curriculum shelf.
 *
 * Store listing (bucket LIST) is Class X residual / n/a. Unknown slugs are not
 * invented. Object keys are constants here, never discovered from MinIO.
 */
export const VIDEO_SPINE = [
  {
    slug: 'foundations-risk-first',
    title: 'Risk first',
    path: 'foundations' as const,
    objectKey: 'foundations/risk-first.mp4',
  },
] as const;

export type VideoSpineItem = (typeof VIDEO_SPINE)[number];

export function listVideoSpine(): readonly VideoSpineItem[] {
  return VIDEO_SPINE;
}

export function getVideoSpineItem(slug: string): VideoSpineItem | undefined {
  return VIDEO_SPINE.find((item) => item.slug === slug);
}
