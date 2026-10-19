import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TemporaryRoom } from "@/components/temporary/temporary-room";
export const metadata:Metadata={title:"Temporary chat",robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))notFound();return <TemporaryRoom key={id} id={id}/>;}
