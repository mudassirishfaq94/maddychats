import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { jwtSecret, ACCESS_TTL_SECONDS } from "../src/server/config";
import { signSessionToken, verifySessionToken } from "../src/server/jwt";
import { sameSignInState } from "../src/server/sign-in-state";

process.env.JWT_SECRET ??= randomBytes(32).toString("hex");
const sub=randomUUID(),sid=randomUUID();

test("session tokens require the intended algorithm, expiry, identity and bounded claims",async()=>{
  const now=Date.now(),iat=Math.floor(now/1000);
  const claims={usr:"fixture",iatMs:now,authTime:now,mfaTime:0,sid};
  const token=async(payload:Record<string,unknown>=claims,options:{algorithm?:string;issuer?:string;audience?:string;subject?:string;expiry?:number|null;type?:string}={})=>{
    let jwt=new SignJWT(payload).setProtectedHeader({alg:options.algorithm??"HS256",typ:options.type??"JWT"})
      .setSubject(options.subject??sub).setIssuer(options.issuer??"maddy-chats").setAudience(options.audience??"maddy-chats-web").setIssuedAt(iat);
    if(options.expiry!==null)jwt=jwt.setExpirationTime(options.expiry??iat+ACCESS_TTL_SECONDS);
    return jwt.sign(jwtSecret());
  };
  assert.equal((await verifySessionToken(await signSessionToken(sub,"fixture",now,0,sid)))?.sub,sub);
  for(const options of [{algorithm:"HS384"},{algorithm:"HS512"},{expiry:null},{expiry:iat-1},{expiry:iat+ACCESS_TTL_SECONDS+1},{issuer:"another-app"},{audience:"circlo-google-mobile-handoff"},{subject:"not-a-uuid"},{type:"oauth-proof"}]){
    assert.equal(await verifySessionToken(await token(claims,options)),null,JSON.stringify(options));
  }
  for(const patch of [{sid:"not-a-uuid"},{sid:42},{iatMs:now+60000},{iatMs:1.5},{authTime:-1},{authTime:"fresh"},{authTime:now+60000},{mfaTime:-1},{mfaTime:"yes"},{usr:42}]){
    assert.equal(await verifySessionToken(await token({...claims,...patch})),null,JSON.stringify(patch));
  }
  assert.equal(await verifySessionToken("x".repeat(8193)),null);
  const signed=await token();assert.equal(await verifySessionToken(signed.slice(0,-2)+"xx"),null);
});

test("verified credential snapshots cannot survive password changes or revocation-watermark changes",()=>{
  const state={id:sub,username:"fixture",passwordHash:"fixture-hash",tokenInvalidBeforeAt:null};
  assert(sameSignInState(state,{...state}));
  assert(!sameSignInState(state,{...state,id:randomUUID()}));
  assert(!sameSignInState(state,{...state,passwordHash:"new-hash"}));
  assert(!sameSignInState(state,{...state,tokenInvalidBeforeAt:new Date()}));
  const revoked={...state,tokenInvalidBeforeAt:new Date(1000)};
  assert(sameSignInState(revoked,{...revoked,tokenInvalidBeforeAt:new Date(1000)}));
  assert(!sameSignInState(revoked,{...revoked,tokenInvalidBeforeAt:new Date(1001)}));
});
