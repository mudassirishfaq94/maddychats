const state=globalThis as typeof globalThis&{__circloTemporaryTransferBusy?:boolean};
/** One large encrypted transfer per process; small chat/control requests stay free. */
export function reserveTemporaryTransfer():(()=>void)|null {
 if(state.__circloTemporaryTransferBusy)return null;
 state.__circloTemporaryTransferBusy=true;let released=false;
 return()=>{if(!released){released=true;state.__circloTemporaryTransferBusy=false;}};
}
