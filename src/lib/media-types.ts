/** Android pickers may omit MIME or report JPEG aliases. Infer only generic types. */
export const MEDIA_TYPES: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg", "jpe", "jfif"], "image/png": ["png"], "image/apng": ["apng"],
  "image/gif": ["gif"], "image/webp": ["webp"], "image/avif": ["avif"],
  "image/heic": ["heic"], "image/heif": ["heif", "hif"], "image/heic-sequence": ["heics"], "image/heif-sequence": ["heifs"],
  "image/bmp": ["bmp", "dib"], "image/tiff": ["tif", "tiff"], "image/x-icon": ["ico"], "image/jxl": ["jxl"],
  "video/mp4": ["mp4", "m4v"], "video/webm": ["webm"], "video/quicktime": ["mov", "qt"],
  "video/x-msvideo": ["avi"], "video/ogg": ["ogv"], "video/x-matroska": ["mkv"], "video/3gpp": ["3gp", "3gpp"],
  "video/3gpp2": ["3g2"], "video/mpeg": ["mpeg", "mpg", "mpe"], "video/mp2t": ["ts", "mts", "m2ts"],
  "video/x-ms-wmv": ["wmv"], "video/x-flv": ["flv"],
  "image/x-adobe-dng": ["dng"], "image/x-canon-cr2": ["cr2"], "image/x-canon-cr3": ["cr3"],
  "image/x-nikon-nef": ["nef"], "image/x-sony-arw": ["arw"], "image/vnd.adobe.photoshop": ["psd"],
  "image/x-fuji-raf": ["raf"], "image/x-panasonic-rw2": ["rw2"], "image/x-olympus-orf": ["orf"],
  "audio/mpeg": ["mp3"], "audio/wav": ["wav"], "audio/mp4": ["m4a"], "audio/aac": ["aac"], "audio/ogg": ["ogg", "opus"],
};
export function normalizeMediaType(name: string, supplied: string): string {
  const type=supplied.split(";")[0].trim().toLowerCase();
  const aliases: Record<string,string>={"image/jpg":"image/jpeg","image/pjpeg":"image/jpeg","image/x-png":"image/png","video/x-m4v":"video/mp4","video/avi":"video/x-msvideo","image/vnd.microsoft.icon":"image/x-icon"};
  if(aliases[type]) return aliases[type];
  if(type && !["application/octet-stream","binary/octet-stream","image/*","video/*"].includes(type)) return type;
  const ext=name.split(".").pop()?.toLowerCase() ?? "";
  return Object.entries(MEDIA_TYPES).find(([,extensions])=>extensions.includes(ext))?.[0] ?? (type || "application/octet-stream");
}
