import { Client } from "pg";
type Subscriber=(connected:boolean)=>void;
/** One shared metadata-only LISTEN connection; room contents never enter NOTIFY. */
class TemporaryRoomListener {
 private client:Client|null=null;
 private connecting:Promise<void>|null=null;
 private subscribers=new Map<string,Set<Subscriber>>();
 private async connect(){if(this.connecting)return this.connecting;if(this.client)return;
  const client=new Client({connectionString:process.env.REALTIME_DATABASE_URL||process.env.DATABASE_URL,application_name:"circlo-temporary-listener",connectionTimeoutMillis:5000,query_timeout:5000,keepAlive:true});
  this.client=client;const fail=()=>{if(this.client!==client)return;this.client=null;for(const group of this.subscribers.values())for(const callback of group)callback(false);void client.end().catch(()=>{});};
  client.on("error",fail);client.on("end",fail);client.on("notification",event=>{if(event.channel!=="circlo_temporary"||!event.payload||!/^[a-f0-9-]{36}$/i.test(event.payload))return;for(const callback of this.subscribers.get(event.payload)??[])callback(true);});
  this.connecting=(async()=>{try{await client.connect();await client.query("LISTEN circlo_temporary");}catch{fail();throw Error("Temporary room updates unavailable");}finally{this.connecting=null;}})();return this.connecting;
 }
 async subscribe(id:string,callback:Subscriber){await this.connect();if(!this.client)throw Error("Room listener disconnected");const set=this.subscribers.get(id)??new Set<Subscriber>();if(set.size>=4)throw Error("Too many room streams");set.add(callback);this.subscribers.set(id,set);return()=>{set.delete(callback);if(!set.size)this.subscribers.delete(id);};}
}
const state=globalThis as typeof globalThis&{__circloTemporaryListener?:TemporaryRoomListener};
export const temporaryRoomListener=state.__circloTemporaryListener??=new TemporaryRoomListener();
