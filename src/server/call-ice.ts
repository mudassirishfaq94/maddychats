import { createHmac } from "node:crypto";

/** Coturn REST credentials expire; the shared relay secret never leaves the server. */
export function callIceConfiguration(userId: string, env: { TURN_URLS?: string; TURN_SECRET?: string } = { TURN_URLS: process.env.TURN_URLS, TURN_SECRET: process.env.TURN_SECRET }, now = Date.now()) {
  const urls = (env.TURN_URLS ?? "").split(",").map(value => value.trim()).filter(Boolean);
  const valid = urls.length > 0 && urls.length <= 8 && urls.every(value =>
    /^turns?:[a-zA-Z0-9.[\]:-]+(?:\?transport=(?:udp|tcp))?$/.test(value));
  const iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> = [
    { urls: "stun:stun.l.google.com:19302" },
  ];
  const configured = valid && Boolean(env.TURN_SECRET && env.TURN_SECRET.length >= 32);
  const expiresAt = Math.floor(now / 1000) + 3600;
  if (configured) {
    const username = `${expiresAt}:${createHmac("sha256", env.TURN_SECRET!).update(userId).digest("hex").slice(0, 24)}`;
    iceServers.push({ urls, username, credential: createHmac("sha1", env.TURN_SECRET!).update(username).digest("base64") });
  }
  return { iceServers, relayConfigured: configured, expiresAt: expiresAt * 1000 };
}

type Ice = ReturnType<typeof callIceConfiguration>;
const cached=new Map<string,{saved:number;value:Ice}>();
/** Cloudflare long-lived API credentials never leave this server-only module. */
export async function loadCallIceConfiguration(userId:string, env:Record<string,string|undefined>=process.env, send:typeof fetch=fetch):Promise<Ice> {
  if(!env.CF_TURN_KEY_ID&&!env.CF_TURN_API_TOKEN)return callIceConfiguration(userId,{TURN_URLS:env.TURN_URLS,TURN_SECRET:env.TURN_SECRET});
  const id=env.CF_TURN_KEY_ID,secret=env.CF_TURN_API_TOKEN;
  if(!id||!/^[a-zA-Z0-9_-]{8,100}$/.test(id)||!secret||secret.length<20)throw new Error("Call connection service is not configured correctly.");
  const key=`${id}:${userId}`,existing=cached.get(key);
  if(existing&&Date.now()-existing.saved<5*60000)return existing.value;
  const response=await send(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`,{method:"POST",headers:{Authorization:`Bearer ${secret}`,"Content-Type":"application/json"},body:JSON.stringify({ttl:3600}),signal:AbortSignal.timeout(2500),cache:"no-store",redirect:"error"});
  if(!response.ok)throw new Error("Call connection service is temporarily unavailable. Please retry.");
  const data=await response.json() as {iceServers?:Array<{urls?:unknown;username?:unknown;credential?:unknown}>};
  const iceServers:Ice["iceServers"]=[];
  for(const server of (Array.isArray(data.iceServers)?data.iceServers:[]).slice(0,8)) {
    const urls=(Array.isArray(server.urls)?server.urls:[server.urls]).filter((url):url is string=>typeof url==="string"&&/^(stun|turn|turns):(?:stun|turn)\.cloudflare\.com:(?:3478|443|80|5349)(?:\?transport=(?:udp|tcp))?$/.test(url));
    if(!urls.length)continue;
    if(urls.some(url=>url.startsWith("turn"))) {
      if(typeof server.username!=="string"||typeof server.credential!=="string"||server.username.length>512||server.credential.length>512)continue;
      iceServers.push({urls,username:server.username,credential:server.credential});
    }else iceServers.push({urls});
  }
  if(!iceServers.some(server=>(Array.isArray(server.urls)?server.urls:[server.urls]).some(url=>url.startsWith("turn"))))throw new Error("Call connection service returned no usable relay.");
  const value={iceServers,relayConfigured:true,expiresAt:Date.now()+3600000};
  if(cached.size>=256)cached.delete(cached.keys().next().value!);
  cached.set(key,{saved:Date.now(),value});return value;
}
