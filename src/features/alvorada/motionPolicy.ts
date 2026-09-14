/** Product policy for the Alvorada intro only. Not an application-wide override.
 * OS motion preferences are diagnostic data, never a renderer/timeline input.
 * Keep the host's always-available skip control and technical recovery paths.
 */
export const ALVORADA_MOTION_MODE = 'canonical' as const;
