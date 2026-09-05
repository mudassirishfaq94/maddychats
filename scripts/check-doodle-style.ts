import {
  parseDoodleStyle,
  encodeDoodleStyleString,
  buildDoodleBackground,
  getPattern,
  isPatternId,
} from "../src/lib/chat-patterns";

const s = parseDoodleStyle("doodle:classic,nature:#22d3ee:#101828:1.4");
console.log("parse ok:", JSON.stringify(s));
console.log("roundtrip:", encodeDoodleStyleString(s!));
console.log("all:", JSON.stringify(parseDoodleStyle("doodle:all:#ffffff:#1b2a38:1")));
console.log("bad color clamps to default:", parseDoodleStyle("doodle:all:red:#1b2a38:1")?.inkColor === "#ffffff");
console.log("rejects bad size:", parseDoodleStyle("doodle:all:#ffffff:#1b2a38:9") === null);
console.log("rejects bad set:", parseDoodleStyle("doodle:nope:#ffffff:#1b2a38:1") === null);
console.log("rejects plain id:", parseDoodleStyle("dots") === null);

const bg = buildDoodleBackground(s!, 0.8);
console.log("bg builds:", bg.startsWith('url("data:image/svg+xml,<svg'), "len", bg.length);

const p = getPattern("doodle:all:#ffffff:#1b2a38:1");
console.log("getPattern resolves doodle:", p?.label, p?.baseColor, typeof p?.background(0.5));
console.log("isPatternId doodle:", isPatternId("doodle:all:#ffffff:#1b2a38:1"), "preset still:", isPatternId("doodles"));
