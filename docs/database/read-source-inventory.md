# Database read source inventory

Generated from the existing code on 2026-10-11. Includes read chains used by screens, authentication, realtime, and action preconditions. SQL in write paths is listed for review but is never passed to EXPLAIN ANALYZE.

## src/server/admin-authentication.ts:38

`	s
tx.select({ role: users.role }).from(users).where(eq(users.id, userId)).for("update")
`

## src/server/admin.ts:17

`	s
db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)
`

## src/server/admin.ts:35

`	s
db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)
`

## src/server/admin.ts:50

`	s
db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
`

## src/server/admin.ts:78

`	s
tx.select({ id: users.id, role: users.role }).from(users).where(inArray(users.id, [actorId, subjectId])).orderBy(asc(users.id)).for("update")
`

## src/server/admin.ts:122

`	s
db
    .select({
      suspendedAt: users.suspendedAt,
      suspendedUntil: users.suspendedUntil,
      suspensionReason: users.suspensionReason,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
`

## src/server/authentication.ts:63

`	s
db.select({ userId: mfaChallenges.userId }).from(mfaChallenges).where(eq(mfaChallenges.tokenHash, digest(token)))
`

## src/server/authentication.ts:66

`	s
tx.select().from(mfaChallenges)
      .where(and(eq(mfaChallenges.tokenHash, digest(token)), gt(mfaChallenges.expiresAt, new Date()))).for("update")
`

## src/server/authentication.ts:69

`	s
tx.select().from(users).where(eq(users.id, challenge.userId)).for("update")
`

## src/server/authentication.ts:72

`	s
tx.select().from(user2fa).where(eq(user2fa.userId, user.id)).for("update")
`

## src/server/chat.ts:40

`	s
db
    .select()
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1)
`

## src/server/chat.ts:54

`	s
db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId))
`

## src/server/chat.ts:173

`	s
db
      .select({
        messageId: messageReactions.messageId,
        userId: messageReactions.userId,
        emoji: messageReactions.emoji,
      })
      .from(messageReactions)
      .where(inArray(messageReactions.messageId, ids))
`

## src/server/chat.ts:181

`	s
db
      .select({
        messageId: messageReads.messageId,
        userId: messageReads.userId,
        readAt: messageReads.readAt,
      })
      .from(messageReads)
      .where(inArray(messageReads.messageId, ids))
`

## src/server/chat.ts:189

`	s
db
      .select()
      .from(messageAttachments)
      .where(inArray(messageAttachments.messageId, ids))
`

## src/server/chat.ts:194

`	s
db.select({ message: messages, sender: users }).from(messages)
        .innerJoin(users, eq(messages.senderId, users.id)).where(inArray(messages.id, replyIds))
`

## src/server/chat.ts:273

`	s
db
    .select({ message: messages, sender: users })
    .from(messages)
    .innerJoin(users, eq(messages.senderId, users.id))
    .where(eq(messages.id, messageId))
    .limit(1)
`

## src/server/chat.ts:294

`	s
db
    .select()
    .from(conversations)
    .where(eq(conversations.dmKey, directKey(a, b)))
    .limit(1)
`

## src/server/chat.ts:305

`	s
db
    .select()
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId))
`

## src/server/chat.ts:315

`	s
db.select().from(conversations).where(and(inArray(conversations.id, convIds), isNull(conversations.deletedAt)))
`

## src/server/chat.ts:316

`	s
db.select({ member: conversationMembers, user: users }).from(conversationMembers).innerJoin(users, eq(conversationMembers.userId, users.id)).where(inArray(conversationMembers.conversationId, convIds))
`

## src/server/chat.ts:317

`	s
db.execute<{ id: string; conversation_id: string; sender_id: string; text: string; type: string; created_at: string; deleted_at: string | null; encrypted: boolean }>(sql`
      SELECT DISTINCT ON (conversation_id) id, conversation_id, sender_id, text, type, created_at, deleted_at, encrypted
      FROM messages WHERE conversation_id IN (${sql.join(convIds.map((id) => sql`${id}`), sql`, `)})
      ORDER BY conversation_id, created_at DESC
    `)
`

## src/server/chat.ts:322

`	s
db.execute<{ conversation_id: string; count: string }>(sql`
      SELECT m.conversation_id, count(*)::text AS count FROM messages m
      LEFT JOIN message_reads r ON r.message_id = m.id AND r.user_id = ${userId}
      WHERE m.conversation_id IN (${sql.join(convIds.map((id) => sql`${id}`), sql`, `)})
        AND m.sender_id <> ${userId} AND m.deleted_at IS NULL AND r.id IS NULL
      GROUP BY m.conversation_id
    `)
`

## src/server/chat.ts:329

`	s
db.selectDistinct({ conversationId: pinnedMessages.conversationId }).from(pinnedMessages).where(inArray(pinnedMessages.conversationId, convIds))
`

## src/server/chat.ts:330

`	s
db.select({ blockerId: blocks.blockerId, blockedId: blocks.blockedId }).from(blocks).where(or(eq(blocks.blockerId, userId), eq(blocks.blockedId, userId)))
`

## src/server/chat.ts:413

`	s
db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1)
`

## src/server/chat.ts:414

`	s
db.select({ user: users, member: conversationMembers }).from(conversationMembers)
      .innerJoin(users, eq(conversationMembers.userId, users.id))
      .where(eq(conversationMembers.conversationId, conversationId))
`

## src/server/chat.ts:466

`	s
db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.id, memberIds))
`

## src/server/chat.ts:493

`	s
db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1)
`

## src/server/chat.ts:502

`	s
db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1)
`

## src/server/chat.ts:570

`	s
db.select({ id: users.id, username: users.username }).from(users)
    .innerJoin(conversationMembers, and(eq(conversationMembers.userId, users.id), eq(conversationMembers.conversationId, conversationId)))
    .where(sql`lower(${users.username}) in (${sql.join(usernames.map((name) => sql`${name}`), sql`, `)})`)
`

## src/server/chat.ts:610

`	s
db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1)
`

## src/server/chat.ts:674

`	s
db
    .select({ message: messages, sender: users })
    .from(messages)
    .innerJoin(users, eq(messages.senderId, users.id))
    .where(where)
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(pageSize + 1)
`

## src/server/chat.ts:719

`	s
db.select().from(users).where(eq(users.id, senderId)).limit(1)
`

## src/server/chat.ts:725

`	s
tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`message-request:${conversationId}`}, 0))`)
`

## src/server/chat.ts:726

`	s
tx.execute<{ pending: boolean; initiator: string; has_message: boolean; retry: boolean }>(sql`
        select c.created_by_id as initiator,
          exists(select 1 from conversation_members p where p.conversation_id=c.id and p.user_id<>c.created_by_id and p.accepted_at is null) as pending,
          exists(select 1 from messages m where m.conversation_id=c.id) as has_message,
          exists(select 1 from messages m where m.conversation_id=c.id and m.sender_id=${senderId} and m.client_message_id=${requestOptions.clientMessageId ?? null}) as retry
        from conversations c where c.id=${conversationId} and c.type='dm' and c.deleted_at is null`)
`

## src/server/chat.ts:743

`	s
tx.execute(sql`
          insert into notifications(user_id,actor_id,type,data)
          select m.user_id, ${senderId}, 'message', jsonb_build_object(
            'conversationId', ${conversationId}::text, 'messageId', ${resultMessage.message.id}::text,
            'actorName', u.display_name, 'preview', 'Message request — accept to continue the conversation')
          from conversation_members m join users u on u.id=${senderId}
          left join notification_preferences p on p.user_id=m.user_id
          where m.conversation_id=${conversationId} and m.user_id<>${senderId}
            and m.muted_at is null and m.archived_at is null
            and coalesce(p.message_notifications,true)`)
`

## src/server/chat.ts:761

`	s
executor
      .select({
        id: messages.id,
        text: messages.text,
        senderId: messages.senderId,
        senderName: users.displayName,
        deletedAt: messages.deletedAt,
        encrypted: messages.encrypted,
      })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(
        and(
          eq(messages.id, replyToMessageId),
          eq(messages.conversationId, conversationId),
        ),
      )
      .limit(1)
`

## src/server/chat.ts:804

`	s
executor.execute<PersistedResult>(sql`
    with inserted as (
      insert into messages (
        conversation_id, sender_id, client_message_id, text, type,
        reply_to_message_id, forwarded, encrypted, delivered_at, expires_at
      ) values (
        ${conversationId}, ${senderId}, ${options?.clientMessageId ?? null}, ${text}, 'text',
        ${replyId}, ${forwarded}, ${encrypted}, ${options?.deliveredAt ?? null}, ${expiresAt}
      )
      on conflict (sender_id, client_message_id) do nothing
      returning id, conversation_id as "conversationId", sender_id as "senderId",
        client_message_id as "clientMessageId", text, type,
        reply_to_message_id as "replyToMessageId", forwarded, encrypted,
        delivered_at as "deliveredAt", created_at as "createdAt",
        updated_at as "updatedAt", edited_at as "editedAt",
        deleted_at as "deletedAt", expires_at as "expiresAt"
    ), bumped as (
      update conversations set last_message_at = ${now}, updated_at = ${now}
      where id = ${conversationId} and exists (select 1 from inserted)
      returning id
    ), published as (
      insert into realtime_events(user_id,payload)
      select recipient::uuid, jsonb_build_object(
        'type','message:new','conversationId',${conversationId}::text,
        'message',to_jsonb(inserted) || ${JSON.stringify(eventDefaults)}::jsonb
      )
      from inserted cross join jsonb_array_elements_text(${JSON.stringify([...new Set(options?.realtimeRecipients ?? [])])}::jsonb) as recipients(recipient)
      returning id
    )
    select inserted.*, true as "wasCreated" from inserted
    union all
    select m.id, m.conversation_id, m.sender_id, m.client_message_id,
      m.text, m.type, m.reply_to_message_id, m.forwarded, m.encrypted,
      m.delivered_at, m.created_at, m.updated_at, m.edited_at,
      m.deleted_at, m.expires_at, false as "wasCreated"
    from messages m
    where m.sender_id = ${senderId}
      and m.client_message_id = ${options?.clientMessageId ?? null}
      and not exists (select 1 from inserted)
    limit 1
  `)
`

## src/server/chat.ts:849

`	s
executor.select().from(messages).where(and(eq(messages.senderId,senderId),eq(messages.clientMessageId,options.clientMessageId))).limit(1)
`

## src/server/chat.ts:905

`	s
db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1)
`

## src/server/chat.ts:928

`	s
db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1)
`

## src/server/chat.ts:958

`	s
db
    .select({ id: messages.id })
    .from(messages)
    .leftJoin(
      messageReads,
      and(
        eq(messageReads.messageId, messages.id),
        eq(messageReads.userId, userId),
      ),
    )
    .where(
      and(
        eq(messages.conversationId, conversationId),
        ne(messages.senderId, userId),
        isNull(messages.deletedAt),
        isNull(messageReads.id),
      ),
    )
`

## src/server/chat.ts:996

`	s
db
    .select({ id: messages.id, conversationId: messages.conversationId })
    .from(messages)
    .innerJoin(
      conversationMembers,
      and(
        eq(conversationMembers.conversationId, messages.conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .where(and(ne(messages.senderId, userId), isNull(messages.deliveredAt)))
`

## src/server/chat.ts:1072

`	s
db
    .select({ conversationId: messages.conversationId })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1)
`

## src/server/chat.ts:1087

`	s
db
    .select({ id: blocks.id })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.blockerId, a), eq(blocks.blockedId, b)),
        and(eq(blocks.blockerId, b), eq(blocks.blockedId, a)),
      ),
    )
    .limit(1)
`

## src/server/chat.ts:1123

`	s
db
    .select({ blockedId: blocks.blockedId })
    .from(blocks)
    .where(eq(blocks.blockerId, userId))
`

## src/server/chat.ts:1238

`	s
db
    .select({ clearedAt: conversationMembers.clearedAt })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId))
`

## src/server/chat.ts:1275

`	s
db
    .select({
      message: messages,
      sender: users,
      conversation: conversations,
      clearedAt: conversationMembers.clearedAt,
    })
    .from(messages)
    .innerJoin(
      conversationMembers,
      and(
        eq(conversationMembers.conversationId, messages.conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .innerJoin(users, eq(users.id, messages.senderId))
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(
      and(
        isNull(messages.deletedAt),
        sql`${messages.text} ILIKE ${`%${q}%`}`,
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(Math.min(Math.max(1, limit), 50))
`

## src/server/chat.ts:1323

`	s
db
    .select({ id: messages.id, conversationId: messages.conversationId })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1)
`

## src/server/chat.ts:1363

`	s
db
    .select({ id: messageStars.id })
    .from(messageStars)
    .where(
      and(
        eq(messageStars.messageId, messageId),
        eq(messageStars.userId, userId),
      ),
    )
    .limit(1)
`

## src/server/chat.ts:1380

`	s
db
    .select({
      star: messageStars,
      message: messages,
      sender: users,
      conversation: conversations,
    })
    .from(messageStars)
    .innerJoin(messages, eq(messageStars.messageId, messages.id))
    .innerJoin(users, eq(messages.senderId, users.id))
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(eq(messageStars.userId, userId))
    .orderBy(desc(messageStars.createdAt))
`

## src/server/chat.ts:1398

`	s
db
    .select()
    .from(messageAttachments)
    .where(inArray(messageAttachments.messageId, msgIds))
`

## src/server/chat.ts:1455

`	s
db
    .select({ type: conversations.type })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1)
`

## src/server/chat.ts:1471

`	s
db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.id, messageId),
        eq(messages.conversationId, conversationId),
      ),
    )
    .limit(1)
`

## src/server/chat.ts:1519

`	s
db
    .select({ id: pinnedMessages.id })
    .from(pinnedMessages)
    .where(
      and(
        eq(pinnedMessages.conversationId, conversationId),
        eq(pinnedMessages.messageId, messageId),
      ),
    )
    .limit(1)
`

## src/server/chat.ts:1536

`	s
db
    .select({ id: pinnedMessages.id })
    .from(pinnedMessages)
    .where(eq(pinnedMessages.conversationId, conversationId))
    .limit(1)
`

## src/server/chat.ts:1549

`	s
db
    .select({
      pin: pinnedMessages,
      message: messages,
      sender: users,
    })
    .from(pinnedMessages)
    .innerJoin(messages, eq(pinnedMessages.messageId, messages.id))
    .innerJoin(users, eq(messages.senderId, users.id))
    .where(eq(pinnedMessages.conversationId, conversationId))
    .orderBy(desc(pinnedMessages.createdAt))
`

## src/server/chat.ts:1597

`	s
db
    .select({ id: messages.id, conversationId: messages.conversationId })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1)
`

## src/server/chat.ts:1618

`	s
db
    .select({ id: messageDeletions.id })
    .from(messageDeletions)
    .where(
      and(
        eq(messageDeletions.messageId, messageId),
        eq(messageDeletions.userId, userId),
      ),
    )
    .limit(1)
`

## src/server/chat.ts:1642

`	s
db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1)
`

## src/server/chat.ts:1667

`	s
db
    .select({ messageId: messageDeletions.messageId })
    .from(messageDeletions)
    .where(
      and(
        inArray(messageDeletions.messageId, messageIds),
        eq(messageDeletions.userId, userId),
      ),
    )
`

## src/server/chat.ts:1685

`	s
db
    .select({ messageId: messageStars.messageId })
    .from(messageStars)
    .where(
      and(
        inArray(messageStars.messageId, messageIds),
        eq(messageStars.userId, userId),
      ),
    )
`

## src/server/chat.ts:1703

`	s
db
    .select({ messageId: pinnedMessages.messageId })
    .from(pinnedMessages)
    .where(
      and(
        inArray(pinnedMessages.messageId, messageIds),
        eq(pinnedMessages.conversationId, conversationId),
      ),
    )
`

## src/server/chat.ts:1735

`	s
db
    .select({ messageId: messageDeletions.messageId })
    .from(messageDeletions)
    .innerJoin(messages, eq(messages.id, messageDeletions.messageId))
    .where(
      and(
        eq(messageDeletions.userId, viewerId),
        eq(messages.conversationId, conversationId),
      ),
    )
`

## src/server/chat.ts:1747

`	s
db
    .select({
      attachment: messageAttachments,
      message: messages,
    })
    .from(messageAttachments)
    .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
    .where(
      and(
        eq(messages.conversationId, conversationId),
        isNull(messages.deletedAt),
        inArray(messageAttachments.kind, ["image", "video"]),
      ),
    )
    .orderBy(desc(messages.createdAt))
`

## src/server/chat.ts:1776

`	s
db
    .select({ messageId: messageDeletions.messageId })
    .from(messageDeletions)
    .innerJoin(messages, eq(messages.id, messageDeletions.messageId))
    .where(
      and(
        eq(messageDeletions.userId, viewerId),
        eq(messages.conversationId, conversationId),
      ),
    )
`

## src/server/chat.ts:1788

`	s
db
    .select({
      attachment: messageAttachments,
      message: messages,
    })
    .from(messageAttachments)
    .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
    .where(
      and(
        eq(messages.conversationId, conversationId),
        isNull(messages.deletedAt),
        eq(messageAttachments.kind, "file"),
      ),
    )
    .orderBy(desc(messages.createdAt))
`

## src/server/chat.ts:1820

`	s
db
    .select({ messageId: messageDeletions.messageId })
    .from(messageDeletions)
    .innerJoin(messages, eq(messages.id, messageDeletions.messageId))
    .where(
      and(
        eq(messageDeletions.userId, viewerId),
        eq(messages.conversationId, conversationId),
      ),
    )
`

## src/server/chat.ts:1832

`	s
db
    .select({ message: messages, sender: users })
    .from(messages)
    .innerJoin(users, eq(messages.senderId, users.id))
    .where(
      and(
        eq(messages.conversationId, conversationId),
        isNull(messages.deletedAt),
        sql`${messages.text} ~* ${'https?://[^\s]+'}`,
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(200)
`

## src/server/communities.ts:34

`	s
db
    .select({
      id: communities.id,
      name: communities.name,
      description: communities.description,
      avatarUrl: communities.avatarUrl,
      createdBy: communities.createdBy,
      isPublic: communities.isPublic,
      createdAt: communities.createdAt,
    })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1)
`

## src/server/communities.ts:50

`	s
db
    .select({ memberCount: sql<number>`count(*)::int` })
    .from(communityMembers)
    .where(eq(communityMembers.communityId, communityId))
`

## src/server/communities.ts:55

`	s
db
    .select({ channelCount: sql<number>`count(*)::int` })
    .from(channels)
    .where(eq(channels.communityId, communityId))
`

## src/server/communities.ts:65

`	s
db
    .select({
      communityId: communityMembers.communityId,
      role: communityMembers.role,
      joinedAt: communityMembers.joinedAt,
    })
    .from(communityMembers)
    .where(eq(communityMembers.userId, userId))
`

## src/server/communities.ts:77

`	s
db
    .select()
    .from(communities)
    .where(sql`${communities.id} IN ${communityIds}`)
`

## src/server/communities.ts:93

`	s
db
    .select({
      id: communities.id,
      name: communities.name,
      description: communities.description,
      avatarUrl: communities.avatarUrl,
      createdBy: communities.createdBy,
      createdAt: communities.createdAt,
    })
    .from(communities)
    .where(eq(communities.isPublic, true))
    .orderBy(sql`${communities.createdAt} DESC`)
    .limit(limit)
`

## src/server/communities.ts:114

`	s
db
    .select()
    .from(communityMembers)
    .where(
      and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.userId, userId),
      ),
    )
    .limit(1)
`

## src/server/communities.ts:128

`	s
db
    .select({ isPublic: communities.isPublic })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1)
`

## src/server/communities.ts:144

`	s
db
    .select({ conversationId: channels.conversationId })
    .from(channels)
    .where(eq(channels.communityId, communityId))
`

## src/server/communities.ts:183

`	s
db
      .select({ conversationId: channels.conversationId })
      .from(channels)
      .where(eq(channels.communityId, communityId))
`

## src/server/communities.ts:227

`	s
db
    .select({ userId: communityMembers.userId, role: communityMembers.role })
    .from(communityMembers)
    .where(eq(communityMembers.communityId, input.communityId))
`

## src/server/communities.ts:261

`	s
db
    .select({
      id: channels.id,
      communityId: channels.communityId,
      name: channels.name,
      description: channels.description,
      type: channels.type,
      createdBy: channels.createdBy,
      conversationId: channels.conversationId,
      createdAt: channels.createdAt,
    })
    .from(channels)
    .where(eq(channels.communityId, communityId))
    .orderBy(sql`${channels.createdAt} ASC`)
`

## src/server/communities.ts:279

`	s
db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      role: communityMembers.role,
      joinedAt: communityMembers.joinedAt,
    })
    .from(communityMembers)
    .innerJoin(users, eq(communityMembers.userId, users.id))
    .where(eq(communityMembers.communityId, communityId))
    .orderBy(sql`CASE ${communityMembers.role} WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`)
`

## src/server/device-sessions.ts:36

`	s
db.select({ id: deviceSessions.id }).from(deviceSessions).where(and(
    eq(deviceSessions.id, claims.sid), eq(deviceSessions.userId, claims.sub), isNull(deviceSessions.revokedAt), gt(deviceSessions.expiresAt, new Date()),
  ))
`

## src/server/device-sessions.ts:49

`	s
tx.select().from(deviceSessions).where(eq(deviceSessions.id, id)).for("update")
`

## src/server/device-sessions.ts:51

`	s
tx.select().from(users).where(eq(users.id, session.userId))
`

## src/server/device-sessions.ts:52

`	s
tx.select().from(user2fa).where(eq(user2fa.userId, session.userId))
`

## src/server/email-verification.ts:31

`	s
tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`verify-email:${user.id}`},0))`)
`

## src/server/email-verification.ts:32

`	s
tx.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.userId,user.id)).orderBy(sql`${emailVerificationTokens.createdAt} desc`).limit(1)
`

## src/server/email-verification.ts:65

`	s
tx.select().from(users).where(eq(users.email,email)).limit(1)
`

## src/server/email-verification.ts:67

`	s
tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`verify-email:${user.id}`},0))`)
`

## src/server/email-verification.ts:68

`	s
tx.select().from(emailVerificationTokens).where(and(eq(emailVerificationTokens.userId,user.id),eq(emailVerificationTokens.tokenHash,codeHash(user.id,code)),isNull(emailVerificationTokens.usedAt))).limit(1)
`

## src/server/group-invites.ts:38

`	s
db
    .select()
    .from(groupInviteLinks)
    .where(eq(groupInviteLinks.code, code))
    .limit(1)
`

## src/server/group-invites.ts:73

`	s
db
    .select()
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, link.conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1)
`

## src/server/group-invites.ts:123

`	s
db
    .select({
      id: groupInviteLinks.id,
      code: groupInviteLinks.code,
      createdAt: groupInviteLinks.createdAt,
      expiresAt: groupInviteLinks.expiresAt,
      maxUses: groupInviteLinks.maxUses,
      useCount: groupInviteLinks.useCount,
      creator: {
        id: users.id,
        displayName: users.displayName,
      },
    })
    .from(groupInviteLinks)
    .innerJoin(users, eq(groupInviteLinks.createdByUserId, users.id))
    .where(eq(groupInviteLinks.conversationId, conversationId))
    .orderBy(sql`${groupInviteLinks.createdAt} DESC`)
`

## src/server/notification-preferences.ts:31

`	s
db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1)
`

## src/server/notification-preferences.ts:41

`	s
db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1)
`

## src/server/notifications.ts:44

`	s
db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(Math.min(Math.max(1, limit), 100))
`

## src/server/notifications.ts:51

`	s
db
    .select({ count: sql<string>`count(*)::text` })
    .from(notifications)
    .where(
      and(eq(notifications.userId, userId), isNull(notifications.readAt)),
    )
`

## src/server/notifications.ts:129

`	s
db
    .select()
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, input.conversationId))
`

## src/server/notifications.ts:133

`	s
db
    .select({ type: conversations.type })
    .from(conversations)
    .where(eq(conversations.id, input.conversationId))
    .limit(1)
`

## src/server/notifications.ts:149

`	s
db.select().from(notifications).where(and(
            eq(notifications.userId, m.userId),
            eq(notifications.type, "message"),
            sql`${notifications.data}->>'messageId' = ${input.messageId}`,
          )).limit(1)
`

## src/server/presence.ts:104

`	s
db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId))
`

## src/server/presence.ts:110

`	s
db
    .selectDistinct({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(
      inArray(
        conversationMembers.conversationId,
        mine.map((m) => m.conversationId),
      ),
    )
`

## src/server/presence.ts:128

`	s
db
    .select({ id: users.id, lastSeenAt: users.lastSeenAt })
    .from(users)
    .where(inArray(users.id, ids))
`

## src/server/presence.ts:154

`	s
db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(and(
      eq(conversationMembers.conversationId, conversationId),
      ne(conversationMembers.userId, excludeUserId),
      gte(users.lastSeenAt, new Date(Date.now() - 90_000)),
    ))
`

## src/server/presence.ts:168

`	s
db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId))
`

## src/server/privacy.ts:43

`	s
db
    .select({
      id: reports.id,
      type: reports.type,
      reason: reports.reason,
      description: reports.description,
      status: reports.status,
      createdAt: reports.createdAt,
      reporter: {
        id: users.id,
        displayName: users.displayName,
        username: users.username,
      },
      targetUser: {
        id: targetUsers.id,
        displayName: targetUsers.displayName,
        username: targetUsers.username,
      },
    })
    .from(reports)
    .innerJoin(users, eq(reports.reporterId, users.id))
    .leftJoin(targetUsers, eq(reports.targetUserId, targetUsers.id))
    .where(where)
    .orderBy(desc(reports.createdAt))
    .limit(limit)
`

## src/server/privacy.ts:108

`	s
db
    .select()
    .from(loginHistory)
    .where(eq(loginHistory.userId, userId))
    .orderBy(desc(loginHistory.createdAt))
    .limit(limit)
`

## src/server/privacy.ts:117

`	s
db
    .select()
    .from(loginHistory)
    .where(
      and(
        eq(loginHistory.userId, userId),
        eq(loginHistory.success, false),
        sql`${loginHistory.createdAt} > ${since}`
      )
    )
    .orderBy(desc(loginHistory.createdAt))
`

## src/server/privacy.ts:143

`	s
db
    .select()
    .from(privacySettings)
    .where(eq(privacySettings.userId, userId))
`

## src/server/privacy.ts:214

`	s
db
    .select({
      id: adminAuditLog.id,
      action: adminAuditLog.action,
      details: adminAuditLog.details,
      createdAt: adminAuditLog.createdAt,
      admin: {
        id: users.id,
        displayName: users.displayName,
        username: users.username,
      },
    })
    .from(adminAuditLog)
    .leftJoin(users, eq(adminAuditLog.adminId, users.id))
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(limit)
`

## src/server/privacy.ts:245

`	s
db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      email: users.email,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      createdAt: users.createdAt,
      lastSeenAt: users.lastSeenAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
`

## src/server/rate-limit.ts:51

`	s
db.execute(sql`
    WITH expired AS (
      SELECT key FROM rate_limit_buckets
      WHERE window_started_at < now() - interval '2 days'
      ORDER BY window_started_at LIMIT 1000 FOR UPDATE SKIP LOCKED
    )
    DELETE FROM rate_limit_buckets b USING expired e WHERE b.key=e.key
    RETURNING b.key
  `)
`

## src/server/realtime.ts:19

`	s
db.execute(sql`
    WITH expired AS (
      SELECT id FROM realtime_events WHERE created_at < now() - interval '10 minutes'
      ORDER BY created_at,id LIMIT 5000 FOR UPDATE SKIP LOCKED
    )
    DELETE FROM realtime_events r USING expired e WHERE r.id=e.id RETURNING r.id
  `)
`

## src/server/realtime.ts:33

`	s
db.select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId))
`

## src/server/realtime.ts:40

`	s
db.select({ id: realtimeEvents.id, payload: realtimeEvents.payload, createdAt: realtimeEvents.createdAt })
    .from(realtimeEvents)
    .where(and(eq(realtimeEvents.userId, userId), gte(realtimeEvents.createdAt, since)))
    .orderBy(asc(realtimeEvents.createdAt))
    .limit(200)
`

## src/server/scheduled-messages.ts:37

`	s
db
    .select()
    .from(scheduledMessages)
    .where(
      and(
        eq(scheduledMessages.conversationId, conversationId),
        eq(scheduledMessages.senderId, userId),
        eq(scheduledMessages.sent, false),
      ),
    )
    .orderBy(sql`${scheduledMessages.scheduledFor} ASC`)
`

## src/server/scheduled-messages.ts:84

`	s
db
    .select()
    .from(scheduledMessages)
    .where(
      and(
        eq(scheduledMessages.sent, false),
        lte(scheduledMessages.scheduledFor, now),
        // Ineligible jobs remain persisted without starving other conversations' due jobs.
        sql`exists(select 1 from conversations c join conversation_members cm on cm.conversation_id=c.id
          where c.id=${scheduledMessages.conversationId} and cm.user_id=${scheduledMessages.senderId}
            and c.deleted_at is null and (not c.admin_only_messaging or cm.role in ('owner','admin'))
            and not exists(select 1 from conversation_members pending where pending.conversation_id=c.id
              and c.type='dm' and pending.user_id<>c.created_by_id and pending.accepted_at is null)
            and not exists(select 1 from conversation_members peer join blocks b
              on (b.blocker_id=${scheduledMessages.senderId} and b.blocked_id=peer.user_id)
                or (b.blocked_id=${scheduledMessages.senderId} and b.blocker_id=peer.user_id)
              where peer.conversation_id=c.id and peer.user_id<>${scheduledMessages.senderId}))`,
      ),
    )
    .orderBy(scheduledMessages.scheduledFor, scheduledMessages.id).limit(50)
`

## src/server/scheduled-messages.ts:115

`	s
tx.select().from(scheduledMessages).where(and(eq(scheduledMessages.id, scheduled.id), eq(scheduledMessages.sent, false))).for("update", { skipLocked: true })
`

## src/server/scheduled-messages.ts:117

`	s
tx.execute<{ allowed: boolean }>(sql`
          select exists(select 1 from conversations c
            join conversation_members cm on cm.conversation_id=c.id and cm.user_id=${scheduled.senderId}
            join users u on u.id=cm.user_id
            where c.id=${scheduled.conversationId} and c.deleted_at is null
              and (not c.admin_only_messaging or cm.role in ('owner','admin'))
              and (u.suspended_at is null or (u.suspended_until is not null and u.suspended_until<now()))
              and (c.slow_mode_seconds=0 or not exists(select 1 from messages recent
                where recent.conversation_id=c.id and recent.sender_id=${scheduled.senderId}
                  and recent.created_at>now()-c.slow_mode_seconds*interval '1 second'))
              and not exists(select 1 from conversation_members peer join blocks b
                on (b.blocker_id=${scheduled.senderId} and b.blocked_id=peer.user_id)
                or (b.blocked_id=${scheduled.senderId} and b.blocker_id=peer.user_id)
                where peer.conversation_id=c.id and peer.user_id<>${scheduled.senderId})
              and (${scheduled.replyToMessageId}::uuid is null or exists(select 1 from messages reply where reply.id=${scheduled.replyToMessageId}::uuid and reply.conversation_id=c.id and reply.deleted_at is null))) as allowed`)
`

## src/server/scheduled-messages.ts:133

`	s
tx.execute<{ pending: boolean }>(sql`
          select exists(select 1 from conversations c
            join conversation_members m on m.conversation_id=c.id
            where c.id=${scheduled.conversationId} and c.type='dm'
              and m.user_id<>c.created_by_id and m.accepted_at is null) as pending`)
`

## src/server/scheduled-messages.ts:139

`	s
tx.select({ disappearingSeconds: conversations.disappearingSeconds }).from(conversations).where(eq(conversations.id, scheduled.conversationId))
`

## src/server/scheduled-messages.ts:174

`	s
db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, scheduled.senderId))
        .limit(1)
`

## src/server/spam-detection.ts:38

`	s
db
    .select({
      burst: sql<number>`count(*) filter (where ${messages.createdAt} >= ${burstWindow})::int`,
      rate: sql<number>`count(*)::int`,
    })
    .from(messages)
    .where(
      and(
        eq(messages.senderId, userId),
        gte(messages.createdAt, windowStart),
      ),
    )
`

## src/server/spam-detection.ts:77

`	s
db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.senderId, userId),
        eq(messages.text, text),
        eq(messages.conversationId, conversationId),
        gte(messages.createdAt, recentWindow),
      ),
    )
    .limit(1)
`

## src/server/spam-detection.ts:99

`	s
db
    .select({ count: sql<number>`count(*)::int` })
    .from(reports)
    .where(
      and(
        eq(reports.reporterId, userId),
        gte(reports.createdAt, windowStart),
      ),
    )
`

## src/server/spam-detection.ts:124

`	s
db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        gte(messages.createdAt, windowStart),
      ),
    )
`

## src/server/status.ts:23

`	s
db.select({ id: blocks.id }).from(blocks).where(or(
    and(eq(blocks.blockerId, a), eq(blocks.blockedId, b)),
    and(eq(blocks.blockerId, b), eq(blocks.blockedId, a)),
  )).limit(1)
`

## src/server/status.ts:35

`	s
db.select({ id: statusRecipients.id }).from(statusRecipients)
    .where(and(eq(statusRecipients.statusId, row.id), eq(statusRecipients.userId, viewerId))).limit(1)
`

## src/server/status.ts:63

`	s
db.select({ userId: statusRecipients.userId }).from(statusRecipients).where(eq(statusRecipients.statusId, row.id))
`

## src/server/status.ts:66

`	s
db.select({ id: users.id }).from(users).where(ne(users.id, row.userId))
`

## src/server/status.ts:68

`	s
db.select().from(blocks).where(or(eq(blocks.blockerId, row.userId), eq(blocks.blockedId, row.userId)))
`

## src/server/status.ts:74

`	s
db.select({ status: statuses, owner: users }).from(statuses)
    .innerJoin(users, eq(statuses.userId, users.id)).where(gt(statuses.expiresAt, new Date())).orderBy(desc(statuses.createdAt))
`

## src/server/status.ts:81

`	s
db.select({ blockerId: blocks.blockerId, blockedId: blocks.blockedId }).from(blocks)
      .where(or(eq(blocks.blockerId, viewerId), eq(blocks.blockedId, viewerId)))
`

## src/server/status.ts:83

`	s
db.select({ statusId: statusRecipients.statusId }).from(statusRecipients)
      .where(and(
        eq(statusRecipients.userId, viewerId),
        inArray(statusRecipients.statusId, rows.map((row) => row.status.id)),
      ))
`

## src/server/status.ts:101

`	s
db.select({ statusId: statusViews.statusId }).from(statusViews).where(and(inArray(statusViews.statusId, ids), eq(statusViews.viewerId, viewerId)))
`

## src/server/status.ts:102

`	s
db.select({ statusId: statusViews.statusId, count: sql<string>`count(*)::text` }).from(statusViews).where(inArray(statusViews.statusId, ids)).groupBy(statusViews.statusId)
`

## src/server/status.ts:103

`	s
db.select({ statusId: statusReactions.statusId, userId: statusReactions.userId, emoji: statusReactions.emoji }).from(statusReactions).where(inArray(statusReactions.statusId, ids))
`

## src/server/status.ts:112

`	s
db.select({ status: statuses, owner: users }).from(statuses).innerJoin(users, eq(statuses.userId, users.id)).where(eq(statuses.id, id)).limit(1)
`

## src/server/status.ts:125

`	s
db.select().from(statuses).where(eq(statuses.id, id)).limit(1)
`

## src/server/status.ts:134

`	s
db.select().from(statuses).where(and(eq(statuses.id, id), eq(statuses.userId, ownerId), gt(statuses.expiresAt, new Date()))).limit(1)
`

## src/server/status.ts:136

`	s
db.select({ viewer: users, viewedAt: statusViews.viewedAt }).from(statusViews).innerJoin(users, eq(statusViews.viewerId, users.id)).where(eq(statusViews.statusId, id)).orderBy(desc(statusViews.viewedAt))
`

## src/server/two-factor.ts:78

`	s
db
    .select()
    .from(user2fa)
    .where(eq(user2fa.userId, userId))
`

## src/server/two-factor.ts:98

`	s
db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
`

## src/server/two-factor.ts:130

`	s
db.select().from(user2fa).where(eq(user2fa.userId, userId))
`

## src/server/two-factor.ts:146

`	s
tx.select().from(user2fa).where(eq(user2fa.userId, userId)).for("update")
`

## src/server/two-factor.ts:175

`	s
db
    .select({ enabled: user2fa.enabled })
    .from(user2fa)
    .where(eq(user2fa.userId, userId))
`

## src/server/two-factor.ts:187

`	s
db
    .select()
    .from(user2fa)
    .where(eq(user2fa.userId, userId))
`

## src/server/two-factor.ts:202

`	s
db.select().from(user2fa).where(eq(user2fa.userId, userId))
`

## src/server/upload-retention.ts:8

`	s
tx.execute<{ path: string }>(sql`
      SELECT u.path FROM stored_uploads u
      WHERE u.created_at < now() - interval '24 hours'
        AND NOT EXISTS (
          SELECT 1 FROM message_attachments a JOIN messages m ON m.id=a.message_id
          JOIN conversations c ON c.id=m.conversation_id
          WHERE a.path=u.path AND m.deleted_at IS NULL AND c.deleted_at IS NULL
          AND (m.expires_at IS NULL OR m.expires_at > now())
        )
        AND NOT EXISTS (SELECT 1 FROM statuses s WHERE s.media_path=u.path AND s.expires_at > now())
        AND NOT EXISTS (SELECT 1 FROM users p WHERE p.avatar_url='/api/media/' || u.path)
        AND NOT EXISTS (SELECT 1 FROM conversations c WHERE c.avatar_url='/api/media/' || u.path AND c.deleted_at IS NULL)
      ORDER BY u.created_at LIMIT 20 FOR UPDATE OF u SKIP LOCKED
    `)
`

## src/server/upload-retention.ts:32

`	s
tx.execute(sql`DELETE FROM statuses s WHERE s.expires_at < now() - interval '24 hours'
      AND (s.media_path IS NULL OR NOT EXISTS (SELECT 1 FROM stored_uploads u WHERE u.path=s.media_path))`)
`

## src/server/users.ts:51

`	s
db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`)
    .limit(1)
`

## src/server/users.ts:62

`	s
db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = ${username.trim().toLowerCase()}`)
    .limit(1)
`

## src/server/users.ts:81

`	s
db.select().from(users).where(eq(users.id, id)).limit(1)
`

## src/server/users.ts:156

`	s
db.select().from(users).where(ne(users.id, excludeUserId)).orderBy(sql`${users.createdAt} DESC`).limit(limit)
`

## src/server/users.ts:158

`	s
db
    .select()
    .from(users)
    .where(
      and(
        ne(users.id, excludeUserId),
        or(
          sql`${users.displayName} ILIKE ${`%${trimmed}%`}`,
          sql`${users.username} ILIKE ${`%${trimmed}%`}`,
        ),
      ),
    )
    .orderBy(asc(users.displayName))
    .limit(limit)
`

## src/server/web-push.ts:135

`	s
db
    .select({ token: fcmTokens.token, platform: fcmTokens.platform })
    .from(fcmTokens)
    .where(eq(fcmTokens.userId, userId))
`

## src/server/web-push.ts:155

`	s
db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
`

## src/app/api/admin/activity/route.ts:28

`	s
db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(typeCondition)
`

## src/app/api/admin/activity/route.ts:33

`	s
db
    .select({
      id: notifications.id,
      type: notifications.type,
      data: notifications.data,
      createdAt: notifications.createdAt,
      userId: notifications.userId,
      userName: users.displayName,
      userUsername: users.username,
    })
    .from(notifications)
    .innerJoin(users, sql`${notifications.userId} = ${users.id}`)
    .where(typeCondition)
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset)
`

## src/app/api/admin/messages/route.ts:28

`	s
db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(searchCondition)
`

## src/app/api/admin/messages/route.ts:33

`	s
db
    .select({
      id: messages.id,
      text: messages.text,
      createdAt: messages.createdAt,
      senderId: messages.senderId,
      senderName: users.displayName,
      senderUsername: users.username,
      conversationId: messages.conversationId,
      conversationName: sql<string>`COALESCE(${conversations.name}, 'Direct Message')`,
    })
    .from(messages)
    .innerJoin(users, sql`${messages.senderId} = ${users.id}`)
    .innerJoin(conversations, sql`${messages.conversationId} = ${conversations.id}`)
    .where(searchCondition)
    .orderBy(desc(messages.createdAt))
    .limit(limit)
    .offset(offset)
`

## src/app/api/admin/messages/[id]/route.ts:18

`	s
tx.select().from(messages).where(eq(messages.id, id)).for("update")
`

## src/app/api/admin/messages/[id]/route.ts:24

`	s
tx.select().from(users).where(eq(users.id, message.senderId))
`

## src/app/api/admin/messages/[id]/route.ts:25

`	s
tx.select({ userId: conversationMembers.userId }).from(conversationMembers).where(eq(conversationMembers.conversationId, message.conversationId))
`

## src/app/api/admin/security/login-history/route.ts:23

`	s
db
    .select()
    .from(loginHistory)
    .where(sql`${loginHistory.createdAt} > ${oneDayAgo}`)
    .orderBy(sql`${loginHistory.createdAt} DESC`)
    .limit(100)
`

## src/app/api/admin/security/retention/route.ts:26

`	s
db.select({ totalMessages: sql<number>`count(*)::int` }).from(messages)
`

## src/app/api/admin/security/retention/route.ts:27

`	s
db.select({ messagesOlderThan90d: sql<number>`count(*)::int` }).from(messages).where(lte(messages.createdAt, ninetyDaysAgo))
`

## src/app/api/admin/security/retention/route.ts:28

`	s
db.select({ messagesOlderThan180d: sql<number>`count(*)::int` }).from(messages).where(lte(messages.createdAt, oneEightyDaysAgo))
`

## src/app/api/admin/security/retention/route.ts:29

`	s
db.select({ totalAttachments: sql<number>`count(*)::int` }).from(messageAttachments)
`

## src/app/api/admin/security/retention/route.ts:30

`	s
db.select({ attachmentsOlderThan90d: sql<number>`count(*)::int` }).from(messageAttachments).where(lte(messageAttachments.createdAt, ninetyDaysAgo))
`

## src/app/api/admin/security/retention/route.ts:31

`	s
db.select({ scheduledCount: sql<number>`count(*)::int` }).from(scheduledMessages).where(eq(scheduledMessages.sent, false))
`

## src/app/api/admin/security/retention/route.ts:32

`	s
db.select({ oldAuditCount: sql<number>`count(*)::int` }).from(adminAuditLog).where(lte(adminAuditLog.createdAt, oneYearAgo))
`

## src/app/api/admin/stats/route.ts:26

`	s
db
    .select({ totalUsers: sql<number>`count(*)::int` })
    .from(users)
`

## src/app/api/admin/stats/route.ts:30

`	s
db
    .select({ totalMessages: sql<number>`count(*)::int` })
    .from(messages)
`

## src/app/api/admin/stats/route.ts:34

`	s
db
    .select({ totalConversations: sql<number>`count(*)::int` })
    .from(conversations)
`

## src/app/api/admin/stats/route.ts:39

`	s
db
    .select({ activeLast24h: sql<number>`count(*)::int` })
    .from(users)
    .where(gte(users.lastSeenAt, oneDayAgo))
`

## src/app/api/admin/stats/route.ts:44

`	s
db
    .select({ activeLast7d: sql<number>`count(*)::int` })
    .from(users)
    .where(gte(users.lastSeenAt, oneWeekAgo))
`

## src/app/api/admin/stats/route.ts:49

`	s
db
    .select({ activeLast30d: sql<number>`count(*)::int` })
    .from(users)
    .where(gte(users.lastSeenAt, oneMonthAgo))
`

## src/app/api/admin/stats/route.ts:55

`	s
db
    .select({ messagesToday: sql<number>`count(*)::int` })
    .from(messages)
    .where(gte(messages.createdAt, oneDayAgo))
`

## src/app/api/admin/stats/route.ts:61

`	s
db
    .select({ messagesThisWeek: sql<number>`count(*)::int` })
    .from(messages)
    .where(gte(messages.createdAt, oneWeekAgo))
`

## src/app/api/admin/stats/route.ts:67

`	s
db
    .select({ bannedUsers: sql<number>`count(*)::int` })
    .from(users)
    .where(sql`${users.tokenInvalidBeforeAt} IS NOT NULL`)
`

## src/app/api/admin/stats/route.ts:73

`	s
db
    .select({ groupCount: sql<number>`count(*)::int` })
    .from(conversations)
    .where(eq(conversations.type, "group"))
`

## src/app/api/admin/stats/route.ts:81

`	s
db
    .select({
      userId: messages.senderId,
      username: users.username,
      displayName: users.displayName,
      count: sql<number>`count(*)::int`,
    })
    .from(messages)
    .innerJoin(users, eq(messages.senderId, users.id))
    .groupBy(messages.senderId, users.username, users.displayName)
    .orderBy(sql`count(*) DESC`)
    .limit(10)
`

## src/app/api/admin/stats/route.ts:95

`	s
db
    .select({
      date: sql<string>`to_char(${messages.createdAt}::date, 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(messages)
    .where(gte(messages.createdAt, oneWeekAgo))
    .groupBy(sql`${messages.createdAt}::date`)
    .orderBy(sql`${messages.createdAt}::date`)
`

## src/app/api/admin/stats/route.ts:106

`	s
db
    .select({
      date: sql<string>`to_char(${users.createdAt}::date, 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(users)
    .where(gte(users.createdAt, oneWeekAgo))
    .groupBy(sql`${users.createdAt}::date`)
    .orderBy(sql`${users.createdAt}::date`)
`

## src/app/api/admin/storage/route.ts:22

`	s
db
    .select({
      totalCount: sql<number>`count(*)::int`,
      totalSize: sql<number>`coalesce(sum(${messageAttachments.size}), 0)::bigint`,
    })
    .from(messageAttachments)
`

## src/app/api/admin/storage/route.ts:30

`	s
db
    .select({
      kind: messageAttachments.kind,
      count: sql<number>`count(*)::int`,
      totalSize: sql<number>`coalesce(sum(${messageAttachments.size}), 0)::bigint`,
    })
    .from(messageAttachments)
    .groupBy(messageAttachments.kind)
`

## src/app/api/admin/storage/route.ts:40

`	s
db
    .select({
      userId: messages.senderId,
      displayName: users.displayName,
      count: sql<number>`count(*)::int`,
      totalSize: sql<number>`coalesce(sum(${messageAttachments.size}), 0)::bigint`,
    })
    .from(messageAttachments)
    .innerJoin(messages, eq(messageAttachments.messageId, messages.id))
    .innerJoin(users, eq(messages.senderId, users.id))
    .groupBy(messages.senderId, users.displayName)
    .orderBy(sql`sum(${messageAttachments.size}) DESC`)
    .limit(10)
`

## src/app/api/admin/users/route.ts:20

`	s
db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        email: users.email,
        role: users.role,
        suspendedAt: users.suspendedAt,
        suspendedUntil: users.suspendedUntil,
        suspensionReason: users.suspensionReason,
        createdAt: users.createdAt,
        lastSeenAt: users.lastSeenAt,
      })
      .from(users)
      .orderBy(sql`${users.createdAt} DESC`)
`

## src/app/api/admin/users/[id]/route.ts:35

`	s
db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      email: users.email,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      createdAt: users.createdAt,
      lastSeenAt: users.lastSeenAt,
      tokenInvalidBeforeAt: users.tokenInvalidBeforeAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1)
`

## src/app/api/admin/users/[id]/route.ts:54

`	s
db
    .select({ messageCount: sql<number>`count(*)::int` })
    .from(messages)
    .where(eq(messages.senderId, id))
`

## src/app/api/admin/users/[id]/route.ts:59

`	s
db
    .select({ conversationCount: sql<number>`count(*)::int` })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, id))
`

## src/app/api/admin/users/[id]/route.ts:65

`	s
db
    .select({
      id: messages.id,
      text: messages.text,
      createdAt: messages.createdAt,
      conversationId: messages.conversationId,
    })
    .from(messages)
    .where(eq(messages.senderId, id))
    .orderBy(sql`${messages.createdAt} DESC`)
    .limit(10)
`

## src/app/api/auth/google/callback/route.ts:73

`	s
db
      .select({ userId: oauthAccounts.userId })
      .from(oauthAccounts)
      .where(and(eq(oauthAccounts.provider, "google"), eq(oauthAccounts.providerAccountId, claims.sub)))
      .limit(1)
`

## src/app/api/auth/google/callback/route.ts:82

`	s
db
      .select({ providerAccountId: oauthAccounts.providerAccountId })
      .from(oauthAccounts)
      .where(and(eq(oauthAccounts.userId, currentUser.id), eq(oauthAccounts.provider, "google")))
      .limit(1)
`

## src/app/api/auth/google/callback/route.ts:104

`	s
db.select({ user: users }).from(oauthAccounts).innerJoin(users, eq(oauthAccounts.userId, users.id)).where(and(eq(oauthAccounts.provider, "google"), eq(oauthAccounts.providerAccountId, claims.sub))).limit(1)
`

## src/app/api/auth/google/callback/route.ts:107

`	s
db.select().from(users).where(sql`lower(${users.email}) = ${claims.email.toLowerCase()}`).limit(1)
`

## src/app/api/auth/google/callback/route.ts:126

`	s
db.select({ id: users.id }).from(users).where(sql`lower(${users.username}) = ${username.toLowerCase()}`).limit(1)
`

## src/app/api/auth/google/native/route.ts:61

`	s
db.select({ user: users }).from(oauthAccounts)
    .innerJoin(users, eq(oauthAccounts.userId, users.id))
    .where(and(eq(oauthAccounts.provider, "google"), eq(oauthAccounts.providerAccountId, claims.sub))).limit(1)
`

## src/app/api/auth/google/native/route.ts:66

`	s
db.select().from(users)
      .where(sql`lower(${users.email}) = ${claims.email.toLowerCase()}`).limit(1)
`

## src/app/api/auth/google/native/route.ts:76

`	s
db.select({ id: users.id }).from(users)
        .where(sql`lower(${users.username}) = ${username.toLowerCase()}`).limit(1)
`

## src/app/api/auth/methods/route.ts:13

`	s
db
    .select({ provider: oauthAccounts.provider })
    .from(oauthAccounts)
    .where(eq(oauthAccounts.userId, user.id))
`

## src/app/api/auth/phone/route.ts:45

`	s
db.select({ user: users }).from(oauthAccounts)
    .innerJoin(users, eq(oauthAccounts.userId, users.id))
    .where(and(eq(oauthAccounts.provider, "firebase_phone"), eq(oauthAccounts.providerAccountId, decoded.uid)))
    .limit(1)
`

## src/app/api/conversations/[id]/export/route.ts:20

`	s
db.select({ id: messages.id, senderId: messages.senderId, text: messages.text, type: messages.type, createdAt: messages.createdAt, encrypted: messages.encrypted })
    .from(messages).where(and(eq(messages.conversationId, id), isNull(messages.deletedAt))).orderBy(asc(messages.createdAt))
`

## src/app/api/conversations/[id]/messages/route.ts:122

`	s
db.execute<SendContext>(sql`
      select c.type, mine.role,
        c.admin_only_messaging, c.slow_mode_seconds, c.last_message_at,
        c.deleted_at, c.disappearing_seconds,
        bool_or(members.accepted_at is null) as request_pending,
        array_agg(members.user_id order by members.joined_at) as member_ids,
        exists (
          select 1 from blocks b
          join conversation_members peer
            on peer.conversation_id = c.id and peer.user_id <> ${me.id}
          where (b.blocker_id = ${me.id} and b.blocked_id = peer.user_id)
             or (b.blocker_id = peer.user_id and b.blocked_id = ${me.id})
        ) as blocked
      from conversations c
      join conversation_members mine
        on mine.conversation_id = c.id and mine.user_id = ${me.id}
      join conversation_members members on members.conversation_id = c.id
      where c.id = ${id}
      group by c.id, mine.role
    `)
`

## src/app/api/conversations/[id]/scheduled/route.ts:77

`	s
db.select({ id: messages.id }).from(messages).where(and(eq(messages.id, replyToMessageId), eq(messages.conversationId, id), isNull(messages.deletedAt))).limit(1)
`

## src/app/api/e2ee/bootstrap/route.ts:53

`	s
tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`e2ee-bootstrap:${conversationId}`}, 0))`)
`

## src/app/api/e2ee/bootstrap/route.ts:54

`	s
tx.select({ id: e2eeConversationKeys.id })
      .from(e2eeConversationKeys)
      .where(eq(e2eeConversationKeys.conversationId, conversationId))
      .limit(1)
`

## src/app/api/e2ee/bootstrap/route.ts:60

`	s
tx.select({ id: e2eeKeys.id }).from(e2eeKeys)
      .where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, deviceId), isNotNull(e2eeKeys.trustedAt)))
      .limit(1)
`

## src/app/api/e2ee/bootstrap/route.ts:69

`	s
tx.select({ id: e2eeKeys.id }).from(e2eeKeys)
        .where(and(eq(e2eeKeys.userId, share.targetUserId), eq(e2eeKeys.deviceId, share.targetDeviceId), isNotNull(e2eeKeys.trustedAt)))
        .limit(1)
`

## src/app/api/e2ee/conversation-keys/route.ts:31

`	s
db
    .select({ id: e2eeKeys.id })
    .from(e2eeKeys)
    .where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, recipientDeviceId)))
    .limit(1)
`

## src/app/api/e2ee/conversation-keys/route.ts:38

`	s
db
    .select()
    .from(e2eeConversationKeys)
    .where(
      and(
        eq(e2eeConversationKeys.conversationId, conversationId),
        eq(e2eeConversationKeys.userId, user.id),
      ),
    )
`

## src/app/api/e2ee/conversation-keys/route.ts:85

`	s
db.select({ id: e2eeKeys.id }).from(e2eeKeys)
    .where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, senderDeviceId), isNotNull(e2eeKeys.trustedAt))).limit(1)
`

## src/app/api/e2ee/conversation-keys/route.ts:91

`	s
db
    .select({ id: e2eeKeys.id })
    .from(e2eeKeys)
    .where(and(eq(e2eeKeys.userId, targetUserId), eq(e2eeKeys.deviceId, recipientDeviceId), isNotNull(e2eeKeys.trustedAt)))
    .limit(1)
`

## src/app/api/e2ee/conversation-keys/route.ts:106

`	s
tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${conversationId}:${targetUserId}:${senderDeviceId}:${recipientDeviceId}`}, 0))`)
`

## src/app/api/e2ee/conversation-keys/route.ts:107

`	s
tx.select().from(e2eeConversationKeys).where(and(
      eq(e2eeConversationKeys.conversationId, conversationId),
      eq(e2eeConversationKeys.userId, targetUserId),
      eq(e2eeConversationKeys.deviceId, senderDeviceId),
      eq(e2eeConversationKeys.recipientDeviceId, recipientDeviceId),
    )).limit(1)
`

## src/app/api/e2ee/devices/approve/route.ts:38

`	s
db.select().from(e2eeKeys).where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, body.sourceDeviceId), ...(selfProof ? [] : [isNotNull(e2eeKeys.trustedAt)]))).limit(1)
`

## src/app/api/e2ee/devices/approve/route.ts:39

`	s
db.select().from(e2eeKeys).where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, body.targetDeviceId))).limit(1)
`

## src/app/api/e2ee/devices/approve/route.ts:50

`	s
db.select().from(deviceLinkRequests).where(and(eq(deviceLinkRequests.id, body.linkId), eq(deviceLinkRequests.userId, user.id), eq(deviceLinkRequests.deviceId, target.deviceId), eq(deviceLinkRequests.status, "pending"), gt(deviceLinkRequests.expiresAt, new Date()))).limit(1)
`

## src/app/api/e2ee/devices/approve/route.ts:52

`	s
db.select({ id: deviceSessions.id }).from(deviceSessions).where(and(eq(deviceSessions.id, link.sessionId), eq(deviceSessions.userId, user.id), isNull(deviceSessions.revokedAt), gt(deviceSessions.expiresAt, new Date()))).limit(1)
`

## src/app/api/e2ee/devices/approve/route.ts:81

`	s
tx.select({ id: users.id }).from(users).where(eq(users.id, user.id)).for("update")
`

## src/app/api/e2ee/devices/approve/route.ts:84

`	s
tx.select().from(deviceSessions).where(eq(deviceSessions.userId, user.id)).orderBy(deviceSessions.id).for("update")
`

## src/app/api/e2ee/devices/approve/route.ts:88

`	s
tx.select().from(deviceSessions).where(and(eq(deviceSessions.id, payload.sessionId as string), eq(deviceSessions.userId, user.id))).for("update")
`

## src/app/api/e2ee/devices/approve/route.ts:93

`	s
tx.select().from(deviceLinkRequests).where(and(eq(deviceLinkRequests.id, payload.linkId), eq(deviceLinkRequests.userId, user.id)))
`

## src/app/api/e2ee/devices/approve/route.ts:95

`	s
tx.select().from(deviceSessions).where(and(eq(deviceSessions.id, pending.sessionId), eq(deviceSessions.userId, user.id))).for("update")
`

## src/app/api/e2ee/devices/approve/route.ts:99

`	s
tx.select().from(e2eeKeys).where(eq(e2eeKeys.userId, user.id)).orderBy(e2eeKeys.id).for("update")
`

## src/app/api/e2ee/devices/approve/route.ts:120

`	s
tx.select().from(deviceLinkRequests).where(and(eq(deviceLinkRequests.id, payload.linkId), eq(deviceLinkRequests.userId, user.id))).for("update")
`

## src/app/api/e2ee/devices/link/route.ts:14

`	s
db.select({ id: deviceLinkRequests.id, deviceId: deviceLinkRequests.deviceId, fingerprint: deviceLinkRequests.fingerprint, status: deviceLinkRequests.status, expiresAt: deviceLinkRequests.expiresAt })
    .from(deviceLinkRequests).where(and(eq(deviceLinkRequests.userId, user.id), gt(deviceLinkRequests.expiresAt, new Date()))).limit(100)
`

## src/app/api/e2ee/devices/link/route.ts:27

`	s
tx.select().from(deviceSessions).where(and(eq(deviceSessions.id, sessionId), eq(deviceSessions.userId, user.id), isNull(deviceSessions.revokedAt), gt(deviceSessions.expiresAt, new Date()))).for("update")
`

## src/app/api/e2ee/devices/link/route.ts:28

`	s
tx.select().from(e2eeKeys).where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, deviceId))).for("update")
`

## src/app/api/e2ee/key-rotation/history/route.ts:42

`	s
db.select({ id: e2eeKeys.id }).from(e2eeKeys)
    .where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, recipientDeviceId))).limit(1)
`

## src/app/api/e2ee/key-rotation/history/route.ts:50

`	s
db.execute<{
    id: string; conversationId: string; userId: string; encryptedKey: string;
    recipientDeviceId: string | null; deviceId: string; keyVersion: number;
    rotatedAt: string; keyFingerprint: string | null;
  }>(sql`
    WITH copies AS (
      SELECT id,conversation_id,user_id,encrypted_key,recipient_device_id,device_id,
        key_version,rotated_at AS stamp,key_fingerprint FROM e2ee_conversation_keys
      WHERE conversation_id=${conversationId} AND user_id=${user.id} AND is_active=false
        AND (recipient_device_id=${recipientDeviceId} OR recipient_device_id IS NULL)
      UNION ALL
      SELECT id,conversation_id,user_id,encrypted_key,recipient_device_id,device_id,
        key_version,created_at AS stamp,key_fingerprint FROM e2ee_key_history
      WHERE conversation_id=${conversationId} AND user_id=${user.id}
        AND (recipient_device_id=${recipientDeviceId} OR recipient_device_id IS NULL)
    ), grouped AS (
      SELECT *,CASE WHEN ${compact} AND recipient_device_id IS NOT NULL
        AND key_fingerprint ~ '^[0-9]{5}( [0-9]{5}){5}$' THEN key_fingerprint ELSE id::text END AS identity FROM copies
    ), retained AS (
      SELECT DISTINCT ON (device_id,recipient_device_id,identity) *
      FROM grouped ORDER BY device_id,recipient_device_id,identity,key_version DESC,id DESC
    )
    SELECT id,conversation_id AS "conversationId",user_id AS "userId",encrypted_key AS "encryptedKey",
      recipient_device_id AS "recipientDeviceId",device_id AS "deviceId",key_version AS "keyVersion",
      stamp AS "rotatedAt",key_fingerprint AS "keyFingerprint" FROM retained
    WHERE (${cursor?.version ?? null}::integer IS NULL OR (key_version,id)<(${cursor?.version ?? null}::integer,${cursor?.id ?? null}::uuid))
    ORDER BY key_version DESC,id DESC LIMIT 201
  `)
`

## src/app/api/e2ee/key-rotation/rotate/route.ts:33

`	s
db
    .select()
    .from(e2eeConversationKeys)
    .where(
      and(
        eq(e2eeConversationKeys.conversationId, conversationId),
        eq(e2eeConversationKeys.userId, user.id),
        eq(e2eeConversationKeys.isActive, true),
      )
    )
    .orderBy(desc(e2eeConversationKeys.rotatedAt))
    .limit(1)
`

## src/app/api/e2ee/key-rotation/status/route.ts:31

`	s
db.select({ id: e2eeKeys.id }).from(e2eeKeys)
    .where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, recipientDeviceId))).limit(1)
`

## src/app/api/e2ee/key-rotation/status/route.ts:36

`	s
db
    .select()
    .from(e2eeConversationKeys)
    .where(
      and(
        eq(e2eeConversationKeys.conversationId, conversationId),
        eq(e2eeConversationKeys.userId, user.id),
        eq(e2eeConversationKeys.recipientDeviceId, recipientDeviceId),
        eq(e2eeConversationKeys.isActive, true),
      )
    )
    .orderBy(desc(e2eeConversationKeys.rotatedAt))
    .limit(1)
`

## src/app/api/e2ee/keys/route.ts:31

`	s
db
    .select({
      id: e2eeKeys.id,
      deviceId: e2eeKeys.deviceId,
      publicKey: e2eeKeys.publicKey,
      encryptedPrivateKey: e2eeKeys.encryptedPrivateKey,
      trustedAt: e2eeKeys.trustedAt,
      createdAt: e2eeKeys.createdAt,
      lastUsedAt: e2eeKeys.lastUsedAt,
      browser: deviceSessions.userAgent,
      sessionExpiresAt: deviceSessions.expiresAt,
      sessionRevokedAt: deviceSessions.revokedAt,
    })
    .from(e2eeKeys)
    .leftJoin(deviceSessions, and(eq(deviceSessions.id, e2eeKeys.sessionId), eq(deviceSessions.userId, e2eeKeys.userId)))
    .where(eq(e2eeKeys.userId, ownerId))
`

## src/app/api/e2ee/keys/route.ts:83

`	s
db
    .select({ id: e2eeKeys.id })
    .from(e2eeKeys)
    .where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, deviceId)))
    .limit(1)
`

## src/app/api/e2ee/keys/route.ts:94

`	s
db
      .select({ publicKey: e2eeKeys.publicKey })
      .from(e2eeKeys)
      .where(eq(e2eeKeys.id, existing.id))
      .limit(1)
`

## src/app/api/e2ee/keys/route.ts:113

`	s
tx.select({ id: users.id }).from(users).where(eq(users.id, user.id)).for("update")
`

## src/app/api/e2ee/keys/route.ts:114

`	s
tx.select({ id: e2eeKeys.id }).from(e2eeKeys).where(eq(e2eeKeys.userId, user.id)).limit(1)
`

## src/app/api/e2ee/keys/route.ts:119

`	s
db.select({ publicKey: e2eeKeys.publicKey, trustedAt: e2eeKeys.trustedAt, sessionId: e2eeKeys.sessionId }).from(e2eeKeys)
    .where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, deviceId))).limit(1)
`

## src/app/api/e2ee/keys/route.ts:123

`	s
db.execute<{ id: string }>(sql`
      select c.id from conversations c join conversation_members p on p.conversation_id=c.id
      where p.user_id=${user.id} and c.type='dm' and c.created_by_id<>${user.id}
        and c.deleted_at is null and c.last_message_at is not null
        and not exists(select 1 from messages m where m.conversation_id=c.id offset 1)
      limit 100`)
`

## src/app/api/e2ee/message-requests/route.ts:11

`	s
db.execute<{ id: string }>(sql`
    select c.id from conversations c
    where c.type='dm' and c.created_by_id=${user.id} and c.deleted_at is null
      and exists(select 1 from messages m where m.conversation_id=c.id)
      and not exists(select 1 from messages m where m.conversation_id=c.id offset 1)
      and exists(select 1 from conversation_members p
        join e2ee_keys k on k.user_id=p.user_id and k.trusted_at is not null
        where p.conversation_id=c.id and p.user_id<>${user.id}
          and not exists(select 1 from e2ee_conversation_keys s
            where s.conversation_id=c.id and s.user_id=p.user_id and s.recipient_device_id=k.device_id))
    order by c.updated_at desc limit 100`)
`

## src/app/api/e2ee/peers/route.ts:38

`	s
db
    .select({ userId: conversationMembers.userId, user: users })
    .from(conversationMembers)
    .innerJoin(users, eq(conversationMembers.userId, users.id))
    .where(eq(conversationMembers.conversationId, conversationId))
`

## src/app/api/e2ee/peers/route.ts:47

`	s
db
    .select({
      userId: e2eeKeys.userId,
      deviceId: e2eeKeys.deviceId,
      publicKey: e2eeKeys.publicKey,
    })
    .from(e2eeKeys)
    .where(and(
      inArray(
        e2eeKeys.userId,
        peers.map((p) => p.userId),
      ),
      isNotNull(e2eeKeys.trustedAt),
    ))
`

## src/app/api/e2ee/peers/route.ts:78

`	s
db.execute<{ allowed: boolean }>(sql`
    select exists(select 1 from conversations c where c.id=${conversationId}
      and c.type='dm' and c.created_by_id=${user.id} and c.deleted_at is null
      and exists(select 1 from conversation_members p where p.conversation_id=c.id and p.user_id<>${user.id} and p.accepted_at is null)
      and not exists(select 1 from messages m where m.conversation_id=c.id)) as allowed`)
`

## src/app/api/e2ee/signal/bundle/route.ts:48

`	s
db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(and(
    eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, targetUserId),
  )).limit(1)
`

## src/app/api/e2ee/signal/bundle/route.ts:54

`	s
tx.select().from(e2eeSignalDevices).where(and(eq(e2eeSignalDevices.userId, targetUserId), isNull(e2eeSignalDevices.revokedAt)))
`

## src/app/api/e2ee/signal/bundle/route.ts:56

`	s
tx.select().from(e2eeSignalPrekeys).where(and(
        eq(e2eeSignalPrekeys.userId, targetUserId), eq(e2eeSignalPrekeys.deviceId, device.deviceId), eq(e2eeSignalPrekeys.kind, "signed"),
      )).limit(1)
`

## src/app/api/e2ee/signal/bundle/route.ts:59

`	s
tx.select().from(e2eeSignalPrekeys).where(and(
        eq(e2eeSignalPrekeys.userId, targetUserId), eq(e2eeSignalPrekeys.deviceId, device.deviceId), eq(e2eeSignalPrekeys.kind, "kyber"),
      )).limit(1)
`

## src/app/api/e2ee/signal/bundle/route.ts:63

`	s
tx.execute<ConsumedPrekey>(sql`
        WITH candidate AS (
          SELECT id FROM e2ee_signal_prekeys
          WHERE user_id = ${targetUserId} AND device_id = ${device.deviceId}
            AND kind = 'one_time' AND consumed_at IS NULL
          ORDER BY created_at ASC
          LIMIT 1 FOR UPDATE SKIP LOCKED
        )
        UPDATE e2ee_signal_prekeys SET consumed_at = now()
        WHERE id = (SELECT id FROM candidate)
        RETURNING key_id, public_key
      `)
`

## src/app/api/e2ee/signal/devices/route.ts:41

`	s
db.select({
    deviceId: e2eeSignalDevices.deviceId,
    registrationId: e2eeSignalDevices.registrationId,
    createdAt: e2eeSignalDevices.createdAt,
    lastSeenAt: e2eeSignalDevices.lastSeenAt,
    oneTimePrekeys: sql<number>`count(${e2eeSignalPrekeys.id}) filter (where ${e2eeSignalPrekeys.kind} = 'one_time' and ${e2eeSignalPrekeys.consumedAt} is null)`,
  }).from(e2eeSignalDevices)
    .leftJoin(e2eeSignalPrekeys, and(eq(e2eeSignalPrekeys.userId, e2eeSignalDevices.userId), eq(e2eeSignalPrekeys.deviceId, e2eeSignalDevices.deviceId)))
    .where(and(eq(e2eeSignalDevices.userId, user.id), isNull(e2eeSignalDevices.revokedAt)))
    .groupBy(e2eeSignalDevices.id)
`

## src/app/api/e2ee/signal/devices/route.ts:104

`	s
tx.select().from(e2eeSignalDevices).where(and(
      eq(e2eeSignalDevices.userId, user.id),
      eq(e2eeSignalDevices.deviceId, deviceId),
    )).limit(1)
`

## src/app/api/e2ee/signal/devices/route.ts:136

`	s
db.select({ id: e2eeSignalDevices.id, deviceId: e2eeSignalDevices.deviceId }).from(e2eeSignalDevices).where(and(
    eq(e2eeSignalDevices.userId, user.id), isNull(e2eeSignalDevices.revokedAt),
  ))
`

## src/app/api/e2ee/signal/mailbox/route.ts:40

`	s
db.select({ id: e2eeSignalDevices.id }).from(e2eeSignalDevices).where(and(
    eq(e2eeSignalDevices.userId, user.id), eq(e2eeSignalDevices.deviceId, deviceId), isNull(e2eeSignalDevices.revokedAt),
  )).limit(1)
`

## src/app/api/e2ee/signal/mailbox/route.ts:45

`	s
db.select().from(e2eeSignalEnvelopes).where(and(
    eq(e2eeSignalEnvelopes.recipientUserId, user.id),
    eq(e2eeSignalEnvelopes.recipientDeviceId, deviceId),
    isNull(e2eeSignalEnvelopes.deliveredAt),
  )).orderBy(asc(e2eeSignalEnvelopes.createdAt)).limit(PAGE_SIZE)
`

## src/app/api/e2ee/signal/mailbox/route.ts:64

`	s
db.select({ id: e2eeSignalDevices.id }).from(e2eeSignalDevices).where(and(
    eq(e2eeSignalDevices.userId, user.id), eq(e2eeSignalDevices.deviceId, deviceId), isNull(e2eeSignalDevices.revokedAt),
  )).limit(1)
`

## src/app/api/e2ee/signal/send/route.ts:62

`	s
db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(eq(conversationMembers.conversationId, conversationId))
`

## src/app/api/e2ee/signal/send/route.ts:64

`	s
db.select({ userId: e2eeSignalDevices.userId, deviceId: e2eeSignalDevices.deviceId }).from(e2eeSignalDevices).where(and(inArray(e2eeSignalDevices.userId, memberIds), isNull(e2eeSignalDevices.revokedAt)))
`

## src/app/api/e2ee/signal/send/route.ts:72

`	s
tx.select({
        id: messages.id,
        createdAt: messages.createdAt,
        conversationId: messages.conversationId,
        text: messages.text,
        encrypted: messages.encrypted,
      }).from(messages).where(and(eq(messages.senderId, user.id), eq(messages.clientMessageId, clientMessageId))).limit(1)
`

## src/app/api/health/route.ts:15

`	s
db.execute(sql`select 1`)
`

## src/app/api/media/[...path]/route.ts:61

`	s
db.select().from(statuses).where(eq(statuses.id, segments[1])).limit(1)
`

## src/app/api/media/[...path]/route.ts:68

`	s
db
      .select({ attachment: messageAttachments, message: messages })
      .from(messageAttachments)
      .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
      .where(eq(messageAttachments.id, segments[0]))
      .limit(1)
`

## src/app/api/media/[...path]/route.ts:78

`	s
db
      .select({ id: conversationMembers.id })
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, found.message.conversationId),
          eq(conversationMembers.userId, me.id),
        ),
      )
      .limit(1)
`

## src/app/api/media/[...path]/route.ts:94

`	s
db
      .select({ id: messageDeletions.id })
      .from(messageDeletions)
      .where(
        and(
          eq(messageDeletions.messageId, found.message.id),
          eq(messageDeletions.userId, me.id),
        ),
      )
      .limit(1)
`

## src/app/api/messages/transcribe/route.ts:28

`	s
tx.select({ attachment: messageAttachments, message: messages })
      .from(messageAttachments)
      .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
      .innerJoin(conversationMembers, and(eq(conversationMembers.conversationId, messages.conversationId), eq(conversationMembers.userId, user.id)))
      .where(and(eq(messageAttachments.id, attachmentId), isNull(messages.deletedAt),
        or(isNull(messages.expiresAt), gt(messages.expiresAt, new Date())),
        or(isNull(conversationMembers.clearedAt), gt(messages.createdAt, conversationMembers.clearedAt)),
        sql`NOT EXISTS (SELECT 1 FROM ${messageDeletions} WHERE ${messageDeletions.messageId} = ${messages.id} AND ${messageDeletions.userId} = ${user.id})`))
      .for("update", { of: messageAttachments })
`

## src/app/api/privacy/devices/route.ts:15

`	s
db.select({ id: deviceSessions.id, userAgent: deviceSessions.userAgent, createdAt: deviceSessions.createdAt, lastSeenAt: deviceSessions.lastSeenAt, expiresAt: deviceSessions.expiresAt }).from(deviceSessions)
    .where(and(eq(deviceSessions.userId, user.id), isNull(deviceSessions.revokedAt), gt(deviceSessions.expiresAt, new Date()))).orderBy(desc(deviceSessions.lastSeenAt)).limit(100)
`

## src/app/api/privacy/devices/route.ts:17

`	s
db.select({ sessionId: e2eeKeys.sessionId, trustedAt: e2eeKeys.trustedAt }).from(e2eeKeys).where(eq(e2eeKeys.userId, user.id))
`

## src/app/api/privacy/devices/route.ts:30

`	s
tx.select({ id: deviceSessions.id }).from(deviceSessions).where(eq(deviceSessions.userId, user.id)).orderBy(deviceSessions.id).for("update")
`

## src/app/api/push/register/route.ts:38

`	s
db
    .select({ id: fcmTokens.id })
    .from(fcmTokens)
    .where(eq(fcmTokens.token, body.token))
    .limit(1)
`

## src/app/api/status/route.ts:51

`	s
tx.execute(sql`select pg_advisory_xact_lock(847221905)`)
`

## src/app/api/status/route.ts:52

`	s
tx.execute<{ count: string }>(sql`select count(*)::text as count from stored_uploads where path like 'statuses/%'`)
`

## src/app/api/status/route.ts:71

`	s
db.select({ id: users.id }).from(users).where(inArray(users.id, selectedUserIds))
`

## src/app/api/upload/message/route.ts:71

`	s
db.select().from(conversations).where(eq(conversations.id, conversationId))
`

## src/app/api/upload/message/route.ts:167

`	s
db
      .select({ conversationId: messages.conversationId })
      .from(messages)
      .where(eq(messages.id, replyToMessageId))
      .limit(1)
`

## src/app/api/upload/message/route.ts:190

`	s
tx.execute(sql`select pg_advisory_xact_lock(847221904)`)
`

## src/app/api/upload/message/route.ts:191

`	s
tx.execute<{ bytes: string }>(sql`select coalesce(sum(size),0)::text as bytes from message_attachments`)
`
