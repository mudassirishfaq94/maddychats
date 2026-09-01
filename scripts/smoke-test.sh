#!/usr/bin/env bash
# ============================================================================
# Maddy Chats — end-to-end smoke test
#
# Exercises the whole product against a running instance: authentication,
# profiles, conversations, persistent messages, receipts, reactions, replies,
# uploads, media authorization, notifications, controls, blocking, and
# security guarantees.
#
# Usage:  ./scripts/smoke-test.sh [BASE_URL]   (default http://localhost:3000)
# Requires: curl, python3. Optional: DATABASE_URL for DB-level assertions.
# ============================================================================
set -u
BASE="${1:-http://localhost:3000}"
HEADERS=(-H "Content-Type: application/json" -H "x-secure-context: 1")
PASS=0
FAIL=0

check() { # check <label> <expected> <actual>
  if [ "$2" = "$3" ]; then
    PASS=$((PASS+1)); printf "  ok   %s (%s)\n" "$1" "$3"
  else
    FAIL=$((FAIL+1)); printf "  FAIL %s (expected %s, got %s)\n" "$1" "$2" "$3"
  fi
}

code() { # code <jar|-> <METHOD> <path> [json-body]
  local jar="$1" method="$2" path="$3" body="${4:-}"
  local args=(-s -o /dev/null -w "%{http_code}" --max-time 25 -X "$method" "${HEADERS[@]}")
  [ "$jar" != "-" ] && args+=(-b "$jar")
  [ -n "$body" ] && args+=(-d "$body")
  args+=("$BASE$path")
  curl "${args[@]}"
}

json() { # json <jar> <METHOD> <path> [json-body] → response body
  local jar="$1" method="$2" path="$3" body="${4:-}"
  local args=(-s --max-time 25 -b "$jar" "${HEADERS[@]}" -X "$method")
  [ -n "$body" ] && args+=(-d "$body")
  args+=("$BASE$path")
  curl "${args[@]}"
}

jget() { python3 -c "import json,sys;d=json.load(sys.stdin);print(d$1)" 2>/dev/null; }

STAMP=$(date +%s%N | tail -c 8)
U1="qaa$STAMP"; U2="qab$STAMP"; U3="qao$STAMP"
EMAIL1="$U1@test.dev"; EMAIL2="$U2@test.dev"; EMAIL3="$U3@test.dev"
# Unique per-run test credential; never a committed or production password.
PASSW="Qa-${STAMP}-7x!"

echo "== Maddy Chats smoke test — $BASE =="

echo "[1] health"
check "GET /api/health" 200 "$(code - GET /api/health)"

echo "[2] registration + validation"
code - POST /api/auth/register "{\"displayName\":\"QA Alice\",\"username\":\"$U1\",\"email\":\"$EMAIL1\",\"password\":\"$PASSW\",\"confirmPassword\":\"$PASSW\"}" > /dev/null
code - POST /api/auth/register "{\"displayName\":\"QA Bob\",\"username\":\"$U2\",\"email\":\"$EMAIL2\",\"password\":\"$PASSW\",\"confirmPassword\":\"$PASSW\"}" > /dev/null
code - POST /api/auth/register "{\"displayName\":\"QA Out\",\"username\":\"$U3\",\"email\":\"$EMAIL3\",\"password\":\"$PASSW\",\"confirmPassword\":\"$PASSW\"}" > /dev/null
login() { curl -s -c "$1" -o /dev/null -w "%{http_code}" --max-time 25 -X POST "$BASE/api/auth/login" "${HEADERS[@]}" -d "{\"identifier\":\"$2\",\"password\":\"$PASSW\"}"; }
check "login A" 200 "$(login /tmp/qa_a.jar "$U1")"
check "login B" 200 "$(login /tmp/qa_b.jar "$U2")"
check "login O" 200 "$(login /tmp/qa_o.jar "$U3")"
check "duplicate email rejected" 409 "$(code - POST /api/auth/register "{\"displayName\":\"QA Dup\",\"username\":\"${U1}x\",\"email\":\"$EMAIL1\",\"password\":\"$PASSW\",\"confirmPassword\":\"$PASSW\"}")"
check "duplicate username rejected" 409 "$(code - POST /api/auth/register "{\"displayName\":\"QA Dup\",\"username\":\"$U1\",\"email\":\"x$EMAIL1\",\"password\":\"$PASSW\",\"confirmPassword\":\"$PASSW\"}")"
check "short password rejected" 422 "$(code - POST /api/auth/register "{\"displayName\":\"QA Dup\",\"username\":\"${U1}y\",\"email\":\"y$EMAIL1\",\"password\":\"short\",\"confirmPassword\":\"short\"}")"
check "wrong password rejected" 401 "$(code - POST /api/auth/login "{\"identifier\":\"$U1\",\"password\":\"nope-nope-nope\"}")"
check "SQL injection login rejected" 401 "$(code - POST /api/auth/login "{\"identifier\":\"' OR 1=1 --\",\"password\":\"$PASSW\"}")"

echo "[3] session"
check "GET /api/auth/me" 200 "$(code /tmp/qa_a.jar GET /api/auth/me)"
check "owner view includes email" 1 "$(json /tmp/qa_a.jar GET /api/users/me | grep -c '@test.dev')"
check "no passwordHash in owner view" 0 "$(json /tmp/qa_a.jar GET /api/users/me | grep -c passwordHash)"
AID=$(json /tmp/qa_a.jar GET /api/auth/me | jget "['user']['id']")
BID=$(json /tmp/qa_b.jar GET /api/auth/me | jget "['user']['id']")
curl -s -o /dev/null -c /tmp/qa_rev.jar --max-time 25 -X POST "$BASE/api/auth/login" "${HEADERS[@]}" -d "{\"identifier\":\"$U1\",\"password\":\"$PASSW\"}"
curl -s -b /tmp/qa_rev.jar -o /dev/null --max-time 25 -X POST "$BASE/api/auth/logout" -H "x-secure-context: 1"
check "copied cookie rejected after logout" 401 "$(code /tmp/qa_rev.jar GET /api/auth/me)"
# Logout revokes ALL of A's tokens (by design) — refresh A's session now.
check "fresh login after revocation" 200 "$(login /tmp/qa_a.jar "$U1")"

echo "[4] profiles"
check "PATCH profile" 200 "$(code /tmp/qa_a.jar PATCH /api/users/me '{"displayName":"QA Alice Prime"}')"
check "username taken rejected" 409 "$(code /tmp/qa_a.jar PATCH /api/users/me "{\"username\":\"$U2\"}")"
check "public profile hides email" 0 "$(json /tmp/qa_a.jar GET "/api/users/$BID" | grep -ic email)"
check "public profile invalid id" 404 "$(code /tmp/qa_a.jar GET /api/users/not-a-uuid)"
check "protected route redirects logged-out" 307 "$(code - GET /app)"

echo "[5] conversations + messages"
CID=$(json /tmp/qa_a.jar POST /api/conversations "{\"userId\":\"$BID\"}" | jget "['conversation']['id']")
check "conversation created" 1 "$([ -n "$CID" ] && echo 1 || echo 0)"
DEDUPE=$(json /tmp/qa_a.jar POST /api/conversations "{\"userId\":\"$BID\"}" | jget "['created']")
check "dm dedupe (created=False)" "False" "$DEDUPE"
check "self conversation rejected" 422 "$(code /tmp/qa_a.jar POST /api/conversations "{\"userId\":\"$AID\"}")"
MID=$(json /tmp/qa_a.jar POST "/api/conversations/$CID/messages" '{"text":"smoke hello"}' | jget "['message']['id']")
BMSG=$(json /tmp/qa_b.jar POST "/api/conversations/$CID/messages" '{"text":"reply hello"}' | jget "['message']['id']")
check "history has both messages" 2 "$(json /tmp/qa_a.jar GET "/api/conversations/$CID/messages" | jget "['messages'].__len__()")"
check "outsider cannot read" 404 "$(code /tmp/qa_o.jar GET "/api/conversations/$CID/messages")"
check "outsider cannot send" 404 "$(code /tmp/qa_o.jar POST "/api/conversations/$CID/messages" '{"text":"x"}')"
check "empty message fails cleanly" 422 "$(code /tmp/qa_a.jar POST "/api/conversations/$CID/messages" '{"text":"   "}')"
check "cannot edit others' message" 403 "$(code /tmp/qa_b.jar PATCH "/api/messages/$MID" '{"text":"x"}')"
check "edit own message" 200 "$(code /tmp/qa_a.jar PATCH "/api/messages/$MID" '{"text":"smoke hello edited"}')"
check "pagination hasMore+cursor" 1 "$(json /tmp/qa_a.jar GET "/api/conversations/$CID/messages?limit=1" | python3 -c "import json,sys;d=json.load(sys.stdin);print(1 if d['hasMore'] and d['nextCursor'] else 0)" 2>/dev/null)"
check "sender-only soft delete" 403 "$(code /tmp/qa_b.jar DELETE "/api/messages/$MID")"

echo "[6] receipts / reactions / replies / realtime / typing"
check "realtime stream requires auth" 401 "$(code - GET /api/realtime/stream)"
rm -f /tmp/qa_stream_a.log /tmp/qa_stream_b.log
curl -sN -b /tmp/qa_a.jar --max-time 18 "$BASE/api/realtime/stream" > /tmp/qa_stream_a.log 2>&1 & SPA=$!
curl -sN -b /tmp/qa_b.jar --max-time 18 "$BASE/api/realtime/stream" > /tmp/qa_stream_b.log 2>&1 & SPB=$!
sleep 1.5

check "typing start accepted" 200 "$(code /tmp/qa_a.jar POST "/api/conversations/$CID/typing" '{"typing":true}')"
sleep 0.3
check "typing stop accepted" 200 "$(code /tmp/qa_a.jar POST "/api/conversations/$CID/typing" '{"typing":false}')"
check "outsider typing rejected" 404 "$(code /tmp/qa_o.jar POST "/api/conversations/$CID/typing" '{"typing":true}')"

LIVE_A=$(json /tmp/qa_a.jar POST "/api/conversations/$CID/messages" '{"text":"live from A"}' | jget "['message']['id']")
LIVE_B=$(json /tmp/qa_b.jar POST "/api/conversations/$CID/messages" '{"text":"live from B"}' | jget "['message']['id']")
check "mark read (member)" 200 "$(code /tmp/qa_b.jar POST "/api/conversations/$CID/read" '{}')"
check "outsider cannot mark read" 404 "$(code /tmp/qa_o.jar POST "/api/conversations/$CID/read" '{}')"
check "reaction added" 200 "$(code /tmp/qa_a.jar POST "/api/messages/$BMSG/reactions" '{"emoji":"👍"}')"
code /tmp/qa_a.jar POST "/api/messages/$BMSG/reactions" '{"emoji":"👍"}' > /dev/null
RCOUNT=$(json /tmp/qa_a.jar GET "/api/conversations/$CID/messages" | python3 -c "
import json,sys
d=json.load(sys.stdin)
m=[x for x in d['messages'] if x['id']=='$BMSG']
print(m[0]['reactions'][0]['count'] if m and m[0]['reactions'] else 0)" 2>/dev/null)
check "duplicate reaction deduped" 1 "$RCOUNT"
REPLYID=$(json /tmp/qa_b.jar POST "/api/conversations/$CID/messages" "{\"text\":\"thread reply\",\"replyToMessageId\":\"$MID\"}" | jget "['message']['id']")
check "reply links parent" 1 "$(json /tmp/qa_a.jar GET "/api/conversations/$CID/messages" | python3 -c "
import json,sys
d=json.load(sys.stdin)
m=[x for x in d['messages'] if x['id']=='$REPLYID']
print(1 if m and m[0]['replyTo'] and m[0]['replyTo']['id']=='$MID' else 0)" 2>/dev/null)"
check "edit publishes" 200 "$(code /tmp/qa_a.jar PATCH "/api/messages/$LIVE_A" '{"text":"live from A edited"}')"
DELMID=$(json /tmp/qa_a.jar POST "/api/conversations/$CID/messages" '{"text":"delete me live"}' | jget "['message']['id']")
check "delete publishes" 200 "$(code /tmp/qa_a.jar DELETE "/api/messages/$DELMID")"
sleep 2
kill "$SPA" "$SPB" 2>/dev/null || true
wait "$SPA" "$SPB" 2>/dev/null || true

check "B receives typing start live" 1 "$(grep -c '"type":"typing:update".*"typing":true' /tmp/qa_stream_b.log)"
check "B receives typing stop live" 1 "$(grep -c '"type":"typing:update".*"typing":false' /tmp/qa_stream_b.log)"
check "B receives A message live" 1 "$(grep -c "\"type\":\"message:new\".*$LIVE_A" /tmp/qa_stream_b.log)"
check "A receives B reply live" 1 "$(grep -c "\"type\":\"message:new\".*$LIVE_B" /tmp/qa_stream_a.log)"
check "B receives edit live" 1 "$(grep -c "\"type\":\"message:update\".*$LIVE_A" /tmp/qa_stream_b.log)"
check "B receives delete live" 1 "$(grep -c "\"type\":\"message:delete\".*$DELMID" /tmp/qa_stream_b.log)"
check "A receives read receipt live" 1 "$(grep -c '"type":"message:read"' /tmp/qa_stream_a.log)"

# Simulate network disconnect + reconnect and verify presence transitions.
rm -f /tmp/qa_presence.log
curl -sN -b /tmp/qa_b.jar --max-time 18 "$BASE/api/realtime/stream" > /tmp/qa_presence.log 2>&1 & PMON=$!
sleep 1
curl -sN -b /tmp/qa_a.jar --max-time 8 "$BASE/api/realtime/stream" >/dev/null 2>&1 & PNET=$!
sleep 1.2; kill "$PNET" 2>/dev/null || true; wait "$PNET" 2>/dev/null || true
sleep 1.2
curl -sN -b /tmp/qa_a.jar --max-time 5 "$BASE/api/realtime/stream" >/dev/null 2>&1 & PRECONNECT=$!
sleep 1.5; kill "$PRECONNECT" 2>/dev/null || true; wait "$PRECONNECT" 2>/dev/null || true
sleep 1; kill "$PMON" 2>/dev/null || true; wait "$PMON" 2>/dev/null || true
ONLINE_EVENTS=$(grep -c "\"type\":\"presence:update\".*\"userId\":\"$AID\".*\"online\":true" /tmp/qa_presence.log || true)
OFFLINE_EVENTS=$(grep -c "\"type\":\"presence:update\".*\"userId\":\"$AID\".*\"online\":false" /tmp/qa_presence.log || true)
check "presence reports offline after disconnect" 1 "$([ "$OFFLINE_EVENTS" -ge 1 ] && echo 1 || echo 0)"
check "presence reports online after reconnect" 1 "$([ "$ONLINE_EVENTS" -ge 2 ] && echo 1 || echo 0)"

echo "[7] uploads + media"
python3 - <<'PY'
import struct, zlib
w = h = 24
def chunk(t, d):
    x = t + d
    return struct.pack('>I', len(d)) + x + struct.pack('>I', zlib.crc32(x))
raw = b''.join(b'\x00' + bytes([30, 150, 120]) * w for _ in range(h))
png = (b'\x89PNG\r\n\x1a\n' +
       chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) +
       chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))
open('/tmp/qa_image.png', 'wb').write(png)
open('/tmp/qa_doc.pdf', 'wb').write(b'%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n')
open('/tmp/qa_note.txt', 'w').write('Maddy Chats final QA text attachment.\n')
PY
printf 'MZ fake executable' > /tmp/qa_x.exe
truncate -s 11000000 /tmp/qa_big.png
rm -f /tmp/qa_upload_stream.log
curl -sN -b /tmp/qa_b.jar --max-time 18 "$BASE/api/realtime/stream" > /tmp/qa_upload_stream.log 2>&1 & PUPLOAD=$!
sleep 1

upload() { # upload <file> <mime> <response-file>
  curl -s -o "$3" -w "%{http_code}" --max-time 60 -b /tmp/qa_a.jar \
    -X POST "$BASE/api/upload/message" -H "x-secure-context: 1" \
    -F "conversationId=$CID" -F "files=@$1;type=$2"
}
IMG_CODE=$(upload /tmp/qa_image.png image/png /tmp/qa_img.json)
PDF_CODE=$(upload /tmp/qa_doc.pdf application/pdf /tmp/qa_pdf.json)
TXT_CODE=$(upload /tmp/qa_note.txt text/plain /tmp/qa_txt.json)
check "real image upload" 201 "$IMG_CODE"
check "real PDF upload" 201 "$PDF_CODE"
check "real text upload" 201 "$TXT_CODE"
sleep 1
kill "$PUPLOAD" 2>/dev/null || true
wait "$PUPLOAD" 2>/dev/null || true
IMAGE_EVENTS=$(grep -c '"type":"message:new".*"kind":"image"' /tmp/qa_upload_stream.log || true)
FILE_EVENTS=$(grep -c '"type":"message:new".*"kind":"file"' /tmp/qa_upload_stream.log || true)
check "B receives image live" 1 "$([ "$IMAGE_EVENTS" -ge 1 ] && echo 1 || echo 0)"
check "B receives files live" 1 "$([ "$FILE_EVENTS" -ge 2 ] && echo 1 || echo 0)"
IMGMSG=$(cat /tmp/qa_img.json | jget "['message']['id']")
IMGATT=$(cat /tmp/qa_img.json | jget "['message']['attachments'][0]['id']")
PDFMSG=$(cat /tmp/qa_pdf.json | jget "['message']['id']")
TXTMSG=$(cat /tmp/qa_txt.json | jget "['message']['id']")
check "member B can access private media" 200 "$(code /tmp/qa_b.jar GET "/api/media/$IMGATT")"
check "outsider cannot access private media" 404 "$(code /tmp/qa_o.jar GET "/api/media/$IMGATT")"
check "anonymous cannot access private media" 401 "$(code - GET "/api/media/$IMGATT")"
check "executable rejected" 422 "$(curl -s -o /dev/null -w "%{http_code}" --max-time 25 -b /tmp/qa_a.jar -X POST "$BASE/api/upload/message" -H "x-secure-context: 1" -F "conversationId=$CID" -F "files=@/tmp/qa_x.exe;type=application/octet-stream")"
check "oversized image rejected" 422 "$(curl -s -o /dev/null -w "%{http_code}" --max-time 60 -b /tmp/qa_a.jar -X POST "$BASE/api/upload/message" -H "x-secure-context: 1" -F "conversationId=$CID" -F "files=@/tmp/qa_big.png;type=image/png")"
check "upload to foreign conversation rejected" 404 "$(curl -s -o /dev/null -w "%{http_code}" --max-time 25 -b /tmp/qa_o.jar -X POST "$BASE/api/upload/message" -H "x-secure-context: 1" -F "conversationId=$CID" -F "files=@/tmp/qa_note.txt;type=text/plain")"
check "delete attachment message" 200 "$(code /tmp/qa_a.jar DELETE "/api/messages/$IMGMSG")"
check "deleted attachment becomes inaccessible" 404 "$(code /tmp/qa_b.jar GET "/api/media/$IMGATT")"

echo "[8] notifications / controls / blocking / search"
check "notifications endpoint" 200 "$(code /tmp/qa_b.jar GET /api/notifications)"
check "pin conversation" 200 "$(code /tmp/qa_a.jar POST "/api/conversations/$CID/controls" '{"action":"pin"}')"
check "outsider cannot control" 404 "$(code /tmp/qa_o.jar POST "/api/conversations/$CID/controls" '{"action":"pin"}')"
check "block user" 200 "$(code /tmp/qa_a.jar POST "/api/users/$BID/block" '{}')"
check "blocked cannot send (server-enforced)" 403 "$(code /tmp/qa_b.jar POST "/api/conversations/$CID/messages" '{"text":"bypass attempt"}')"
code /tmp/qa_a.jar DELETE "/api/users/$BID/block" > /dev/null
check "unblock restores messaging" 201 "$(code /tmp/qa_b.jar POST "/api/conversations/$CID/messages" '{"text":"back after unblock"}')"
check "message search scoped to viewer" 0 "$(curl -s -b /tmp/qa_o.jar --max-time 25 "$BASE/api/search/messages?q=smoke" | jget "['results'].__len__()")"

echo "[9] persistence after logout + fresh login"
code /tmp/qa_a.jar POST /api/auth/logout '{}' > /dev/null
code /tmp/qa_b.jar POST /api/auth/logout '{}' > /dev/null
check "A re-login after persistence break" 200 "$(login /tmp/qa_a.jar "$U1")"
check "B re-login after persistence break" 200 "$(login /tmp/qa_b.jar "$U2")"
json /tmp/qa_a.jar GET "/api/conversations/$CID/messages" > /tmp/qa_persist.json
check "conversation persists" 200 "$(code /tmp/qa_a.jar GET "/api/conversations/$CID")"
check "profile edit persists" "QA Alice Prime" "$(json /tmp/qa_a.jar GET /api/users/me | jget "['user']['displayName']")"
check "edited message persists" "smoke hello edited" "$(cat /tmp/qa_persist.json | python3 -c "import json,sys;d=json.load(sys.stdin);print(next(x['text'] for x in d['messages'] if x['id']=='$MID'))" 2>/dev/null)"
check "deleted state persists" 1 "$(cat /tmp/qa_persist.json | python3 -c "import json,sys;d=json.load(sys.stdin);m=next(x for x in d['messages'] if x['id']=='$DELMID');print(1 if m['deletedAt'] and m['text']=='' else 0)" 2>/dev/null)"
check "reaction persists" 1 "$(cat /tmp/qa_persist.json | python3 -c "import json,sys;d=json.load(sys.stdin);m=next(x for x in d['messages'] if x['id']=='$BMSG');print(m['reactions'][0]['count'])" 2>/dev/null)"
check "reply persists" "$MID" "$(cat /tmp/qa_persist.json | python3 -c "import json,sys;d=json.load(sys.stdin);m=next(x for x in d['messages'] if x['id']=='$REPLYID');print(m['replyTo']['id'])" 2>/dev/null)"
check "PDF metadata persists" 1 "$(cat /tmp/qa_persist.json | python3 -c "import json,sys;d=json.load(sys.stdin);m=next(x for x in d['messages'] if x['id']=='$PDFMSG');print(1 if m['attachments'][0]['mimeType']=='application/pdf' else 0)" 2>/dev/null)"
check "text-file metadata persists" 1 "$(cat /tmp/qa_persist.json | python3 -c "import json,sys;d=json.load(sys.stdin);m=next(x for x in d['messages'] if x['id']=='$TXTMSG');print(1 if m['attachments'][0]['mimeType']=='text/plain' else 0)" 2>/dev/null)"
check "read receipt persists" 1 "$(cat /tmp/qa_persist.json | python3 -c "import json,sys;d=json.load(sys.stdin);m=next(x for x in d['messages'] if x['id']=='$MID');print(1 if m['readBy'] else 0)" 2>/dev/null)"
check "pin setting persists" "True" "$(json /tmp/qa_a.jar GET /api/conversations | python3 -c "import json,sys;d=json.load(sys.stdin);print(next(x['pinned'] for x in d['conversations'] if x['id']=='$CID'))" 2>/dev/null)"
check "notifications persist" 1 "$(json /tmp/qa_a.jar GET /api/notifications | python3 -c "import json,sys;d=json.load(sys.stdin);print(1 if len(d['notifications'])>0 else 0)" 2>/dev/null)"

if [ -n "${DATABASE_URL:-}" ] && command -v psql >/dev/null 2>&1; then
  echo "[10] database"
  HASHED=$(psql "$DATABASE_URL" -t -A -c "SELECT CASE WHEN left(password_hash,4) = '\$2b\$' THEN 't' ELSE 'f' END FROM users WHERE username='$U1'" 2>/dev/null | tr -d '[:space:]')
  check "password hashed with bcrypt (never plaintext)" "t" "$HASHED"
fi

echo ""
echo "== result: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
