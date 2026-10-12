import { test } from "node:test";
import assert from "node:assert/strict";
import { withLoginTimings, measureLoginStage, recordLoginQueue } from "../src/server/login-performance";
import { passwordConcurrency } from "../src/server/password-concurrency";

test("worker tuning cannot create unbounded work or exceed libuv capacity", () => {
  assert.equal(passwordConcurrency(),2);
  assert.equal(passwordConcurrency("3","4"),3);
  assert.equal(passwordConcurrency("3","2"),1);
  assert.equal(passwordConcurrency("3","1"),1);
  for (const bad of ["0","-1","4","100","1.5","NaN",""]) assert.equal(passwordConcurrency(bad,"4"),2);
  assert.equal(passwordConcurrency("3","invalid"),3);
});

test("diagnostics are local-only, isolate concurrent requests and exclude secrets", async () => {
  const originalFlag=process.env.LOGIN_PERFORMANCE_DIAGNOSTICS, originalUrl=process.env.CLIENT_URL, originalSecret=process.env.HEALTHCHECK_SECRET;
  const originalLog=console.log, logs:string[]=[];
  console.log=(value:unknown)=>{logs.push(String(value));};
  try {
    process.env.LOGIN_PERFORMANCE_DIAGNOSTICS="1";
    process.env.CLIENT_URL="https://maddychats.onrender.com";
    process.env.HEALTHCHECK_SECRET="private-test-health-secret";
    const publicResponse=await withLoginTimings(async()=>new Response(null,{status:200}));
    assert.equal(publicResponse.headers.get("Server-Timing"),null);
    const wrong=await withLoginTimings(async()=>new Response(null,{status:200}),{headers:new Headers({authorization:"Bearer invalid"})});
    assert.equal(wrong.headers.get("Server-Timing"),null);
    assert.equal(logs.length,0,"production cannot enable these diagnostics");
    const privateResponse=await withLoginTimings(async()=>{
      await measureLoginStage("password_work",async()=>true);
      return new Response(null,{status:200});
    },{headers:new Headers({authorization:"Bearer private-test-health-secret"})});
    assert(privateResponse.headers.get("Server-Timing")?.includes("password_work;dur="));
    assert.equal(logs.length,0,"authorized live probes produce no timing logs");
    process.env.CLIENT_URL="http://127.0.0.1:3190";
    await Promise.all(["first","second"].map(stage=>withLoginTimings(async()=>{
      await measureLoginStage(stage,async()=>{await new Promise(resolve=>setTimeout(resolve,5));});
      recordLoginQueue(3);
      return new Response(null,{status:200});
    })));
    const parsed=logs.map(line=>JSON.parse(line.slice("[login-performance] ".length)));
    assert.equal(parsed.length,2);
    for (const sample of parsed) {
      assert.equal(sample.status,200); assert(sample.totalMs>=0);
      assert.equal(sample.stages.password_queue,3);
      assert.equal(Object.keys(sample.stages).filter(key=>key!=="password_queue").length,1);
      assert.deepEqual(Object.keys(sample).sort(),["stages","status","totalMs"]);
    }
    await assert.rejects(withLoginTimings(async()=>{throw new Error("credential-secret-token");}));
    assert(!logs.join("").includes("credential-secret-token"));
    assert.equal(JSON.parse(logs[2].slice("[login-performance] ".length)).status,500);
  } finally {
    console.log=originalLog;
    if(originalFlag===undefined)delete process.env.LOGIN_PERFORMANCE_DIAGNOSTICS;else process.env.LOGIN_PERFORMANCE_DIAGNOSTICS=originalFlag;
    if(originalUrl===undefined)delete process.env.CLIENT_URL;else process.env.CLIENT_URL=originalUrl;
    if(originalSecret===undefined)delete process.env.HEALTHCHECK_SECRET;else process.env.HEALTHCHECK_SECRET=originalSecret;
  }
});
