import test from "node:test";
import assert from "node:assert/strict";
import { newRoomCode,newRoomIdentity,normalizeRoomCode,roomCodeHash,roomSharedKey,sealRoomMessage,openRoomMessage } from "../src/lib/temporary-room-crypto";
test("temporary room code authenticates both-device encryption and binds room/message/sender",async()=>{
 const host=await newRoomIdentity(),guest=await newRoomIdentity(),code=newRoomCode(),room=crypto.randomUUID(),id=crypto.randomUUID();
 assert.match(code,/^[a-f0-9]{24}$/);assert.equal(normalizeRoomCode(code.match(/.{1,4}/g)!.join("-")),code);assert.equal(normalizeRoomCode("12345"),null);assert.notEqual(await roomCodeHash(code),code);
 const a=await roomSharedKey(host.privateKey,guest.publicKey,code,room),b=await roomSharedKey(guest.privateKey,host.publicKey,code,room);
 const cipher=await sealRoomMessage(a,room,id,"host",{text:"Private temporary message",file:{name:"test.txt",type:"text/plain",data:btoa("private file")}});
 assert(!cipher.includes("Private temporary message"));assert.equal((await openRoomMessage(b,room,id,"host",cipher)).text,"Private temporary message");
 const wrongCode=await roomSharedKey(guest.privateKey,host.publicKey,newRoomCode(),room);
 for(const [key,r,i,s] of [[wrongCode,room,id,"host"],[b,crypto.randomUUID(),id,"host"],[b,room,crypto.randomUUID(),"host"],[b,room,id,"guest"]] as const)await assert.rejects(openRoomMessage(key,r,i,s,cipher));
 await assert.rejects(openRoomMessage(b,room,id,"host",cipher.slice(0,-5)+"AAAA="));
});
