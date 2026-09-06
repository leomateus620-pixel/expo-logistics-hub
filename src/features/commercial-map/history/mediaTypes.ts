import type { HistoricalDate } from './types';

/** Media approval is independent of text approval. No remote hotlinks in the UI. */
export interface HistoryImage {
  id: string;
  historyIds: string[];
  src: string;
  width: number;
  height: number;
  variants: { src: string; width: number }[];
  thumbnailSrc: string;
  fullSrc: string;
  alt: string;
  caption: string;
  role: 'period' | 'recent' | 'context';
  captureDate: HistoricalDate | null;
  publicationDate: HistoricalDate | null;
  credit: string | null;
  collection: string | null;
  sourcePageUrl: string;
  originalImageUrl: string;
  bindingStatus: 'verified' | 'pending';
  verificationStatus: 'verified' | 'pending';
  permission: {
    status: 'authorized' | 'pending' | 'restricted';
    label: string;
    sourceUrl: string | null;
    authorizationOrigin: string | null;
  };
}

export function isLocalHistoryAsset(src: string): boolean {
  return /^\/history\/[a-zA-Z0-9/_-]+\.(?:webp|avif|jpe?g|png)$/.test(src);
}

export function isPublishableHistoryImage(image: HistoryImage, historyId: string): boolean {
  return image.historyIds.includes(historyId)
    && image.bindingStatus === 'verified'
    && image.verificationStatus === 'verified'
    && image.permission.status === 'authorized'
    && Boolean(image.permission.authorizationOrigin || image.permission.sourceUrl)
    && image.width > 0 && image.height > 0
    && isLocalHistoryAsset(image.src)
    && isLocalHistoryAsset(image.fullSrc)
    && isLocalHistoryAsset(image.thumbnailSrc)
    && image.variants.every((variant) => variant.width > 0 && isLocalHistoryAsset(variant.src));
}
