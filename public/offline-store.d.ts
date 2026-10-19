export interface OfflineChat {id:string;name:string;type?:"dm"|"group";unreadCount?:number;favorited?:boolean;pinned?:boolean;archived?:boolean;lastMessageAt?:string|null;blocked?:boolean;requestPending?:boolean;locked?:boolean;preview?:{text:string;kind:string;createdAt:string}}
export interface OfflineText {id:string;conversationId:string;text:string;createdAt:string;source?:"offline"|"chat";replyToMessageId?:string|null;failed?:boolean;reason?:string}
export function activeAccount():string|null;
export function rememberChats(userId:string,chats:OfflineChat[]):Promise<void>;
export function offlineChats(userId:string):Promise<OfflineChat[]>;
export function enqueueText(userId:string,conversationId:string,text:string):Promise<OfflineText>;
export function queuedTexts(userId:string):Promise<OfflineText[]>;
export function removeText(userId:string,id:string):Promise<void>;
export function forgetOffline(userId:string):Promise<void>;

export interface OfflineHistoryMessage {id:string;senderId:string;senderName:string;createdAt:string;kind:"message"|"deleted"|"ephemeral"|"media";text:string;mine:boolean}
export function chatLocked(id:string):boolean;
export function rememberHistory(userId:string,conversationId:string,messages:OfflineHistoryMessage[],replace?:boolean,removedIds?:string[]):Promise<void>;
export function offlineHistory(userId:string,conversationId:string):Promise<{messages:OfflineHistoryMessage[];syncedAt?:string}>;
export function forgetHistory(userId:string,conversationId:string):Promise<void>;

export function saveOfflineDraft(userId:string,conversationId:string,text:string):Promise<void>;
export function offlineDraft(userId:string,conversationId:string):Promise<string>;

export function offlineStorageWarning():string|null;
