/** Shared input budgets. Multipart includes space for keys, captions and AES-GCM overhead. */
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;
export const ENCRYPTED_MEDIA_OVERHEAD = 28;
export const UPLOAD_BODY_MAX_BYTES = MEDIA_MAX_BYTES + 1024 * 1024;
export const PHOTO_OUTPUT_MAX_BYTES = 3 * 1024 * 1024;
