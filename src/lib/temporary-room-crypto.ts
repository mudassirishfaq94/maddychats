const encoder = new TextEncoder();
export const TEMPORARY_FILE_LIMIT = 5 * 1024 * 1024;
export const TEMPORARY_MESSAGE_LIMIT = 2000;
export type TemporaryContent = { text: string; file?: { name: string; type: string; data: string } };
export function toBase64(bytes: Uint8Array): string {
 let value=""; for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value);
}
export function fromBase64(value:string):Uint8Array<ArrayBuffer> {return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
export function newRoomCode():string {return Array.from(crypto.getRandomValues(new Uint8Array(12)),n=>n.toString(16).padStart(2,"0")).join("");}
export function normalizeRoomCode(value:string):string|null {const code=value.replace(/[\s-]/g,"").toLowerCase();return /^[a-f0-9]{24}$/.test(code)?code:null;}
export async function roomCodeHash(code:string):Promise<string> {return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(code))),n=>n.toString(16).padStart(2,"0")).join("");}
export async function newRoomIdentity() {
 const pair=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
 return {publicKey:toBase64(new Uint8Array(await crypto.subtle.exportKey("spki",pair.publicKey))),privateKey:toBase64(new Uint8Array(await crypto.subtle.exportKey("pkcs8",pair.privateKey)))};
}
export async function roomSharedKey(privateKey:string,publicKey:string,code:string,roomId:string):Promise<CryptoKey> {
 const own=await crypto.subtle.importKey("pkcs8",fromBase64(privateKey),{name:"ECDH",namedCurve:"P-256"},false,["deriveBits"]);
 const peer=await crypto.subtle.importKey("spki",fromBase64(publicKey),{name:"ECDH",namedCurve:"P-256"},false,[]);
 const shared=await crypto.subtle.deriveBits({name:"ECDH",public:peer},own,256);
 const material=await crypto.subtle.importKey("raw",shared,"HKDF",false,["deriveKey"]);
 // The unsubmitted invitation secret authenticates the exchange. Its hash alone
 // (which is all the server receives) cannot derive the room key.
 return crypto.subtle.deriveKey({name:"HKDF",hash:"SHA-256",salt:encoder.encode(code),info:encoder.encode(`circlo-temporary-v1:${roomId}`)},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
const context=(room:string,id:string,sender:string)=>encoder.encode(`circlo-temporary-v1:${room}:${id}:${sender}`);
export async function sealRoomMessage(key:CryptoKey,room:string,id:string,sender:string,content:TemporaryContent):Promise<string> {
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:context(room,id,sender)},key,encoder.encode(JSON.stringify(content)));
 return `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}
export async function openRoomMessage(key:CryptoKey,room:string,id:string,sender:string,sealed:string):Promise<TemporaryContent> {
 const [iv,body,extra]=sealed.split(".");if(extra||!iv||!body)throw Error("Invalid encrypted message");
 const decrypted=await crypto.subtle.decrypt({name:"AES-GCM",iv:fromBase64(iv),additionalData:context(room,id,sender)},key,fromBase64(body));
 const data:unknown=JSON.parse(new TextDecoder().decode(decrypted));
 if(!data||typeof data!=="object"||!("text" in data)||typeof data.text!=="string"||data.text.length>TEMPORARY_MESSAGE_LIMIT)throw Error("Invalid message");
 const result=data as TemporaryContent;
 if(result.file&&(typeof result.file.name!=="string"||result.file.name.length>255||typeof result.file.type!=="string"||result.file.type.length>100||typeof result.file.data!=="string"||result.file.data.length>Math.ceil(TEMPORARY_FILE_LIMIT/3)*4))throw Error("Invalid attachment");
 return result;
}
