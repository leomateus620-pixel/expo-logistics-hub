export const AGENDA_MEETING_ALLOWED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/wav',
  'text/plain;charset=utf-8',
] as const;

export const AGENDA_MEETING_TEXT_SEGMENT_MIME_TYPE = 'text/plain;charset=utf-8';

export type AgendaMeetingAllowedMimeType = (typeof AGENDA_MEETING_ALLOWED_MIME_TYPES)[number];

const MEDIA_RECORDER_CANDIDATES = AGENDA_MEETING_ALLOWED_MIME_TYPES.filter(
  (mimeType): mimeType is Exclude<AgendaMeetingAllowedMimeType, 'audio/wav' | 'text/plain;charset=utf-8'> =>
    mimeType !== 'audio/wav' && mimeType.startsWith('audio/'),
);


export function normalizeAudioMimeType(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s*;\s*/g, ';')
    .replace(/\s*=\s*/g, '=');
}
export function isAllowedAudioMimeType(value: string): value is AgendaMeetingAllowedMimeType {
  const normalized = normalizeAudioMimeType(value);
  return AGENDA_MEETING_ALLOWED_MIME_TYPES.some((candidate) => candidate === normalized);
}

export function selectMediaRecorderMimeType(
  mediaRecorderConstructor: Pick<typeof MediaRecorder, 'isTypeSupported'> | undefined =
    typeof MediaRecorder === 'undefined' ? undefined : MediaRecorder,
): Exclude<AgendaMeetingAllowedMimeType, 'audio/wav'> | null {
  if (!mediaRecorderConstructor) return null;
  return MEDIA_RECORDER_CANDIDATES.find((mimeType) => mediaRecorderConstructor.isTypeSupported(mimeType)) ?? null;
}

export function listSupportedMediaRecorderMimeTypes(
  mediaRecorderConstructor: Pick<typeof MediaRecorder, 'isTypeSupported'> | undefined =
    typeof MediaRecorder === 'undefined' ? undefined : MediaRecorder,
): AgendaMeetingAllowedMimeType[] {
  if (!mediaRecorderConstructor) return [];
  return MEDIA_RECORDER_CANDIDATES.filter((mimeType) => mediaRecorderConstructor.isTypeSupported(mimeType));
}
