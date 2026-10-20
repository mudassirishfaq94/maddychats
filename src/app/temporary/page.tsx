import type { Metadata } from "next";
import { TemporaryRoom } from "@/components/temporary/temporary-room";
export const metadata:Metadata={title:"Temporary chat",robots:{index:false,follow:false}};
export default function Page(){return <TemporaryRoom key="entry"/>;}
