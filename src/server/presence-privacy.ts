import { db } from "@/db";
import { sql } from "drizzle-orm";

/** Both directions of blocking take precedence over every visibility option. */
export async function visiblePresenceIds(viewer:string, subjects:string[]):Promise<string[]> {
  const validId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  if (!validId(viewer)) return [];
  subjects = [...new Set(subjects.filter(validId))];
  if(!subjects.length)return [];
  const result = await db.execute(sql`select s.id from users s left join privacy_settings p on p.user_id=s.id where s.id in (${sql.join(subjects.map(id=>sql`${id}::uuid`),sql`,`)}) and (s.id=${viewer} or (not exists(select 1 from blocks where (blocker_id=s.id and blocked_id=${viewer}) or (blocker_id=${viewer} and blocked_id=s.id)) and
    case coalesce(p.last_seen_visibility,'everyone') when 'everyone' then true
    when 'contacts' then exists(select 1 from user_contacts c where c.owner_id=s.id and c.contact_id=${viewer})
    when 'specific' then coalesce(p.last_seen_contacts,'[]'::jsonb) ? ${viewer} and exists(select 1 from user_contacts c where c.owner_id=s.id and c.contact_id=${viewer})
    else false end))`);
  return result.rows.map(row=>String(row.id));
}
export async function canSeePresence(viewer:string,subject:string):Promise<boolean> {
  return (await visiblePresenceIds(viewer,[subject])).includes(subject);
}
