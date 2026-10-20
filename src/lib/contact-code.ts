export function contactCodeId(value: string, origin = "https://circlo.chat"): string | null {
  const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if(uuid.test(value.trim()))return value.trim();
  try { const url=new URL(value.trim());if(url.origin!==origin||url.username||url.password||url.search||url.hash)return null;const match=url.pathname.match(/^\/contact\/([^/]+)\/?$/);return match&&uuid.test(match[1])?match[1]:null; }catch{return null;}
}
