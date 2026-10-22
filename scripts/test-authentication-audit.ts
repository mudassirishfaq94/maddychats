/** Destructive fixtures are restricted to a fresh, disposable loopback database. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash, generateKeyPairSync } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";

async function main() {
  const url=new URL(process.env.LOAD_TEST_ADMIN_URL??"");
  assert.equal(url.hostname,"127.0.0.1");assert.equal(url.pathname,"/postgres");
  const admin=new Pool({connectionString:url.toString()});
  const database=`auth_audit_${randomUUID().replaceAll("-","")}_test`;
  let sql:Pool|undefined,appPool:Pool|undefined,created=false;
  const savedFetch=globalThis.fetch;
  try{
    await admin.query(`CREATE DATABASE "${database}"`);created=true;url.pathname=`/${database}`;
    process.env.DATABASE_URL=url.toString();process.env.JWT_SECRET=randomBytes(32).toString("hex");
    process.env.CLIENT_URL="http://localhost:3193";process.env.GOOGLE_CLIENT_ID="isolated-google-audit-client";
    sql=new Pool({connectionString:url.toString()});await migrate(drizzle(sql),{migrationsFolder:"drizzle"});
    appPool=(await import("../src/db")).pool;
    const {findUserById}=await import("../src/server/users");
    const {issueDeviceSession,rotateDeviceSession}=await import("../src/server/device-sessions");
    const {beginSignIn,completeMfaChallenge}=await import("../src/server/authentication");
    const {resolveSessionAccess,resolveSessionToken}=await import("../src/server/session");
    const {verifySessionToken}=await import("../src/server/jwt");
    const {SignInStateError}=await import("../src/server/sign-in-state");
    const {generateTOTPSetup,generateTOTP,verifyAndEnable2FA,disable2FA,replaceRecoveryCodes}=await import("../src/server/two-factor");
    const request=()=>new NextRequest(process.env.CLIENT_URL+"/api/auth/login",{method:"POST",headers:{Origin:process.env.CLIENT_URL!}});
    const account=async()=>{
      const id=randomUUID(),name="audit_"+id.replaceAll("-","").slice(0,12);
      await sql!.query("insert into users(id,username,display_name,email,password_hash,email_verified_at) values($1,$2,$2,$3,'isolated-hash',now())",[id,name,`${id}@example.invalid`]);
      return (await findUserById(id))!;
    };
    const activeSession=async(user:Awaited<ReturnType<typeof account>>,mfaTime=0)=>{
      const credentials=await issueDeviceSession(request(),user,mfaTime);
      const sid=(await verifySessionToken(credentials.access))!.sid!;
      await sql!.query("update device_sessions set approval_required=false where id=$1",[sid]);
      return {...credentials,sid};
    };

    const stale=await account();
    await sql.query("update users set password_hash='changed',token_invalid_before_at=now() where id=$1",[stale.id]);
    await assert.rejects(issueDeviceSession(request(),stale,0),SignInStateError);
    assert.equal((await beginSignIn(request(),stale)).status,401);
    assert.equal((await sql.query("select count(*)::int n from device_sessions where user_id=$1",[stale.id])).rows[0].n,0);
    const secret="GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    await sql.query("insert into user_2fa(user_id,secret,enabled,enabled_at) values($1,$2,true,now())",[stale.id,secret]);
    assert.equal((await beginSignIn(request(),stale)).status,401,"A stale password proof cannot create a new MFA challenge");
    assert.equal((await sql.query("select count(*)::int n from mfa_challenges where user_id=$1",[stale.id])).rows[0].n,0);

    const racing=await account(),lock=await sql.connect();
    try{
      await lock.query("begin");await lock.query("select id from users where id=$1 for update",[racing.id]);
      const issuance=issueDeviceSession(request(),racing,0).then(()=>false,error=>error instanceof SignInStateError);
      const deadline=Date.now()+10000;let waiting=false;
      while(Date.now()<deadline){
        const rows=await sql.query("select 1 from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and wait_event_type='Lock' and query ilike '%users%' limit 1");
        if(rows.rowCount){waiting=true;break;}await new Promise(resolve=>setTimeout(resolve,20));
      }
      assert(waiting,"The issuance transaction must wait behind the account lock");
      await lock.query("update users set password_hash='changed-during-login',token_invalid_before_at=clock_timestamp() where id=$1",[racing.id]);await lock.query("commit");
      assert(await issuance,"An in-flight login must reject a proof replaced while it waited");
    }finally{await lock.query("rollback");lock.release();}
    const suspended=await account();await sql.query("update users set suspended_at=now() where id=$1",[suspended.id]);
    await assert.rejects(issueDeviceSession(request(),suspended,0),SignInStateError);
    console.log("PASS: stale password proofs, MFA-challenge issuance, in-flight reset serialization and suspension recheck");

    const owner=await account(),old=await activeSession(owner);
    const setup=await generateTOTPSetup(owner.id,old.sid);assert(!("error" in setup));
    const enabled=await verifyAndEnable2FA(owner.id,generateTOTP(setup.secret!,Math.floor(Date.now()/30000)),old.sid);assert(enabled.success);
    assert.equal(await resolveSessionToken(old.access),null);
    assert("error" in await generateTOTPSetup(owner.id,old.sid),"A pre-enrollment actor cannot replace the enabled secret");
    assert.equal(await replaceRecoveryCodes(owner.id,old.sid),null);
    assert.equal((await disable2FA(owner.id,old.sid)).success,false);
    assert.equal((await sql.query("select secret from user_2fa where user_id=$1",[owner.id])).rows[0].secret,setup.secret);
    await assert.rejects(issueDeviceSession(request(),owner,0),SignInStateError,"An MFA change between primary verification and issuance cannot be skipped");
    const current=await activeSession((await findUserById(owner.id))!,enabled.mfaTime);
    const other=await account(),outsider=await activeSession(other);
    assert.equal(await replaceRecoveryCodes(owner.id,outsider.sid),null,"Session ownership is checked inside the mutation");
    const codes=await replaceRecoveryCodes(owner.id,current.sid);assert.equal(codes?.length,10);
    const pending=await beginSignIn(request(),(await findUserById(owner.id))!);
    const token=pending.cookies.get("maddy_mfa_challenge")!.value;
    const completed=await completeMfaChallenge(token,codes![0]);assert(completed);
    await sql.query("update users set token_invalid_before_at=clock_timestamp() where id=$1",[owner.id]);
    await assert.rejects(issueDeviceSession(request(),completed,completed.mfaTime),SignInStateError,"Reset after a valid factor proof still prevents later cookie issuance");
    // A fresh authorized actor can disable MFA, but no pre-enrollment cookie or
    // refresh token may become valid again when the factor row disappears.
    await new Promise(resolve=>setTimeout(resolve,2));
    const disableActor=await activeSession((await findUserById(owner.id))!,enabled.mfaTime);
    assert((await disable2FA(owner.id,disableActor.sid)).success);
    assert.equal(await resolveSessionToken(old.access),null);
    assert.equal(await resolveSessionToken(disableActor.access),null);
    assert.equal(await rotateDeviceSession(old.refresh),null);
    assert.equal(await rotateDeviceSession(disableActor.refresh),null);
    assert.equal((await sql.query("select count(*)::int n from mfa_challenges where user_id=$1",[owner.id])).rows[0].n,0);
    assert("error" in await generateTOTPSetup(owner.id,disableActor.sid));
    const pendingActor=await issueDeviceSession(request(),(await findUserById(other.id))!,0);
    const pendingSid=(await verifySessionToken(pendingActor.access))!.sid;
    assert.equal((await resolveSessionAccess(pendingActor.access))?.approvalRequired,true);
    assert("error" in await generateTOTPSetup(other.id,pendingSid),"Restricted sign-ins cannot manage MFA");
    console.log("PASS: MFA epoch/ownership checks, recovery replacement, completed-proof revocation and no cookie/refresh revival after MFA removal");

    const googleUser=await account();await sql.query("insert into oauth_accounts(user_id,provider,provider_account_id) values($1,'google','isolated-google-subject')",[googleUser.id]);
    const pair=generateKeyPairSync("rsa",{modulusLength:2048}),kid="isolated-audit-key";
    globalThis.fetch=(async(input:RequestInfo|URL)=>{
      assert.equal(String(input),"https://www.googleapis.com/oauth2/v3/certs","No external provider request is allowed in this fixture");
      return Response.json({keys:[{...pair.publicKey.export({format:"jwk"}),kid,alg:"RS256",use:"sig"}]});
    }) as typeof fetch;
    const native=(await import("../src/app/api/auth/google/native/route")).POST;
    const idToken=await new SignJWT({email:googleUser.email,email_verified:true,nonce:randomUUID()}).setProtectedHeader({alg:"RS256",kid}).setSubject("isolated-google-subject").setIssuer("https://accounts.google.com").setAudience(process.env.GOOGLE_CLIENT_ID!).setIssuedAt().setExpirationTime("5m").sign(pair.privateKey);
    const exchange=(body:unknown)=>native(new NextRequest(process.env.CLIENT_URL+"/api/auth/google/native",{method:"POST",headers:{Origin:process.env.CLIENT_URL!,"Content-Type":"application/json"},body:JSON.stringify(body)}));
    assert.equal((await exchange({idToken,acceptTerms:true,acceptPrivacy:true})).status,200);
    assert.equal((await exchange({idToken,acceptTerms:true,acceptPrivacy:true})).status,409,"The same native provider bearer proof cannot mint a second session");
    const {createGoogleMobileHandoff}=await import("../src/server/google-mobile-handoff");
    const verifier=randomBytes(48).toString("base64url"),ticket=await createGoogleMobileHandoff(googleUser.id,googleUser.username,createHash("sha256").update(verifier).digest("base64url"));
    await sql.query("update users set token_invalid_before_at=clock_timestamp() where id=$1",[googleUser.id]);
    assert.equal((await exchange({ticket,verifier})).status,401,"A pre-reset mobile ticket cannot resume authentication after account revocation");
    console.log("PASS: real native Google signature verification with local JWKS, single-use provider proof and mobile handoff revocation");
    const {consumeProviderProof}=await import("../src/server/provider-proof");
    const phoneProof=randomBytes(32).toString("base64url");
    const phoneResults=await Promise.all([consumeProviderProof("firebase-phone",phoneProof),consumeProviderProof("firebase-phone",phoneProof)]);
    assert.equal(phoneResults.filter(Boolean).length,1,"Concurrent phone proof consumption is single-use");
    assert(await consumeProviderProof("google-native",phoneProof),"Provider namespaces cannot consume one another's proofs");
  }finally{
    globalThis.fetch=savedFetch;await appPool?.end();await sql?.end();
    if(created)await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);await admin.end();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
