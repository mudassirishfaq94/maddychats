import QRCode from "qrcode";
import { getSessionUser } from "@/server/session";
import { clientUrl } from "@/server/config";
import { jsonError } from "@/server/http";
export async function GET() {
  const me=await getSessionUser();if(!me)return jsonError(401,"Not authenticated.");
  const svg=await QRCode.toString(`${clientUrl()}/contact/${me.id}`,{type:"svg",errorCorrectionLevel:"M",margin:3,width:256});
  return new Response(svg,{headers:{"Content-Type":"image/svg+xml","Cache-Control":"private, no-store","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'","X-Content-Type-Options":"nosniff"}});
}
