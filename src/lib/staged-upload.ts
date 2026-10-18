import { MEDIA_CHUNK_BYTES } from "./media-limits";
/** Only client-encrypted bytes enter this bounded transfer path. */
export async function stageEncryptedFile(file:File,conversationId:string,mime:string,signal:AbortSignal,progress:(loaded:number)=>void):Promise<string> {
  const response=await fetch("/api/upload/staged",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:file.name,mime,size:file.size,conversationId,encrypted:true}),signal});
  const data=await response.json();if(!response.ok||typeof data.token!=="string")throw new Error(data.error??"Upload could not start.");
  const token=data.token;let offset=0;
  while(offset<file.size) {
    signal.throwIfAborted();const chunk=file.slice(offset,Math.min(offset+MEDIA_CHUNK_BYTES,file.size));
    let completed=false;
    for(let attempt=0;attempt<3&&!completed;attempt++) {
      try {
        await new Promise<void>((resolve,reject)=>{
          const xhr=new XMLHttpRequest();xhr.open("PUT","/api/upload/staged");xhr.timeout=120000;
          xhr.setRequestHeader("X-Upload-Token",token);xhr.setRequestHeader("X-Upload-Offset",String(offset));
          const abort=()=>xhr.abort();signal.addEventListener("abort",abort,{once:true});
          xhr.onloadend=()=>signal.removeEventListener("abort",abort);
          xhr.upload.onprogress=event=>{if(event.lengthComputable)progress(offset+event.loaded);};
          xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(new Error("Upload chunk failed."));
          xhr.onerror=xhr.ontimeout=xhr.onabort=()=>reject(new Error("Upload interrupted."));
          if(signal.aborted){reject(new Error("Upload cancelled."));return;}xhr.send(chunk);
        });
        offset+=chunk.size;completed=true;
      }catch(error){
        signal.throwIfAborted();
        const status=await fetch("/api/upload/staged",{headers:{"X-Upload-Token":token},cache:"no-store",signal});
        const saved=await status.json();
        if(status.ok&&saved.offset===offset+chunk.size){offset=saved.offset;completed=true;}
        else if(!status.ok||saved.offset!==offset||attempt===2)throw error;
      }
    }
    progress(offset);
  }
  return token;
}
