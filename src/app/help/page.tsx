import type { Metadata } from "next";
import { CircloHelp } from "@/components/help/circlo-help";
export const metadata:Metadata={title:"Circlo Help",description:"Verified instructions for Circlo messages, calls, groups, privacy, recovery and temporary chats."};
export default function Page(){return <CircloHelp/>;}
