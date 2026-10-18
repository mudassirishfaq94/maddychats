import "dotenv/config";
import pg from "pg";
const email=process.argv.find(value=>value.startsWith("--email="))?.slice(8).toLowerCase();
if(!email)throw new Error("Use --email=account@example.com; add --apply only for an authorized recovery.");
const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,statement_timeout:10000});
try {
  await client.connect();await client.query("BEGIN");
  const result=await client.query("select id,email,role,email_verified_at,suspended_at from users where lower(email)=$1 for update",[email]);
  if(result.rows.length!==1)throw new Error("Expected exactly one existing account.");
  const user=result.rows[0];
  if(!user.email_verified_at||user.suspended_at)throw new Error("Recovery requires a verified, active account.");
  console.log(JSON.stringify({email:user.email,previousRole:user.role,apply:process.argv.includes("--apply")}));
  if(process.argv.includes("--apply")&&user.role!=="admin") {
    await client.query("update users set role='admin',updated_at=now() where id=$1",[user.id]);
    await client.query("insert into admin_audit_log(admin_id,action,target_user_id,details) values($1,'admin_role_recovered',$1,$2::jsonb)",[user.id,JSON.stringify({source:"authorized-owner-maintenance",previousRole:user.role,newRole:"admin"})]);
  }
  await client.query("COMMIT");
  const verified=await client.query("select role from users where id=$1",[user.id]);console.log(JSON.stringify({role:verified.rows[0].role,mfaRequired:true}));
}catch(error){await client.query("ROLLBACK").catch(()=>{});throw error;}finally{await client.end();}
