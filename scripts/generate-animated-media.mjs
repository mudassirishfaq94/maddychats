import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";

const names = ["hello", "love", "laugh", "celebrate", "yes", "busy"];
await mkdir("public/stickers", { recursive: true }); await mkdir("public/gifs", { recursive: true });
for (const name of names) {
  const frames = [];
  for (let frame = 0; frame < 12; frame++) {
    const t = frame / 12 * Math.PI * 2, bounce = Math.sin(t) * 6;
    let detail = '<circle cx="72" cy="82" r="5"/><circle cx="120" cy="82" r="5"/><path d="M68 108Q96 134 124 108" fill="none" stroke="#242329" stroke-width="7" stroke-linecap="round"/>';
    if (name === "love") detail = '<path d="M58 75C48 55 82 53 84 72C91 51 124 55 114 76L86 105Z" fill="#B9667A"/><path d="M72 117Q96 132 120 117" fill="none" stroke="#242329" stroke-width="6" stroke-linecap="round"/>';
    if (name === "laugh") detail = '<path d="M61 85L75 75L86 86M106 86L117 75L132 85" fill="none" stroke="#242329" stroke-width="6" stroke-linecap="round"/><path d="M67 108Q96 159 126 108Z"/><ellipse cx="96" cy="123" rx="12" ry="6" fill="#B9667A"/>';
    if (name === "yes") detail = '<path d="M61 98L85 121L134 69" fill="none" stroke="#34564A" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>';
    if (name === "busy") detail = '<circle cx="74" cy="82" r="5"/><circle cx="120" cy="82" r="5"/><path d="M82 116h28" stroke="#242329" stroke-width="6" stroke-linecap="round"/>';
    const extra = name === "hello" ? `<g transform="rotate(${Math.sin(t) * 18} 144 100)"><path d="M143 128V92M151 94V74M143 94V69M135 94V76M127 94V83" stroke="#F0C38E" stroke-width="9" stroke-linecap="round"/><ellipse cx="140" cy="107" rx="19" ry="23" fill="#F0C38E"/></g>` : name === "celebrate" ? Array.from({ length: 9 }, (_, i) => `<rect x="${22 + i * 18}" y="${18 + ((frame * 7 + i * 17) % 140)}" width="6" height="12" rx="2" fill="${["#B9667A", "#8CAED0", "#8DB5A2"][i % 3]}"/>`).join("") : name === "busy" ? `<g opacity="${0.4 + frame / 20}" fill="#C9A77B"><circle cx="78" cy="29" r="4"/><circle cx="96" cy="29" r="4"/><circle cx="114" cy="29" r="4"/></g>` : "";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192"><g transform="translate(0 ${bounce})"><circle cx="96" cy="98" r="62" fill="#C9A77B"/><g fill="#242329">${detail}</g></g>${extra}</svg>`;
    frames.push(await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer());
  }
  const image = () => sharp(Buffer.concat(frames), { raw: { width: 192, height: 192 * 12, channels: 4, pageHeight: 192 } });
  await writeFile(`public/stickers/circlo-${name}-v1.webp`, await image().webp({ quality: 80, loop: 0, delay: Array(12).fill(100) }).toBuffer());

  await writeFile(`public/stickers/circlo-${name}-v1.png`, await sharp(frames[0], { raw: { width: 192, height: 192, channels: 4 } }).png().toBuffer());
}

// GIFs are miniature scenes, not sticker drawings encoded a second time.
const gifNames = ["orbit", "cozy", "plot-twist", "big-win", "on-my-way", "recharge"];
const stars = (frame) => Array.from({ length: 12 }, (_, i) => `<circle cx="${12 + (i * 47) % 168}" cy="${12 + (i * 31) % 155}" r="${i % 3 === 0 ? 2 : 1}" fill="#D7D2EA" opacity="${0.35 + (Math.sin(frame / 12 * Math.PI * 2 + i) + 1) * 0.3}"/>`).join("");
function scene(name, frame) {
  const t = frame / 12 * Math.PI * 2, sway = Math.sin(t), bounce = sway * 5;
  const bg = name === "cozy" ? "#473841" : name === "plot-twist" ? "#342D49" : name === "big-win" ? "#29453F" : "#282D45";
  let drawing = stars(frame);
  if (name === "orbit") drawing += `<ellipse cx="99" cy="145" rx="69" ry="17" fill="none" stroke="#74718D" stroke-width="3"/><circle cx="${99 + Math.cos(t) * 69}" cy="${145 + Math.sin(t) * 17}" r="7" fill="#CEAA81"/><g transform="translate(0 ${bounce})"><rect x="76" y="98" width="42" height="39" rx="16" fill="#B7BFCE"/><path d="M86 131L80 148M109 131L114 148" stroke="#B7BFCE" stroke-width="12" stroke-linecap="round"/><path d="M78 108L65 119" stroke="#D6DCE6" stroke-width="11" stroke-linecap="round"/><g transform="rotate(${sway * 23} 116 105)"><path d="M116 105L134 84L135 73" fill="none" stroke="#D6DCE6" stroke-width="11" stroke-linecap="round"/></g><circle cx="97" cy="79" r="32" fill="#E0E2E7"/><rect x="74" y="62" width="46" height="32" rx="14" fill="#545A7E"/><circle cx="88" cy="75" r="3" fill="#F6EEE2"/><circle cx="107" cy="75" r="3" fill="#F6EEE2"/><path d="M90 83Q97 91 105 83" fill="none" stroke="#CEAA81" stroke-width="3" stroke-linecap="round"/></g>`;
  if (name === "cozy") drawing = `<rect y="130" width="192" height="62" fill="#644B49"/><circle cx="153" cy="41" r="23" fill="#BD9979" opacity=".55"/><g transform="translate(0 ${bounce / 3})"><ellipse cx="69" cy="126" rx="46" ry="25" fill="#B58E7C"/><path d="M39 94L39 61L60 78L78 62L86 97Z" fill="#CAA995"/><circle cx="64" cy="96" r="28" fill="#CAA995"/><path d="M47 94Q53 100 59 94M68 94Q74 100 80 94" fill="none" stroke="#493A42" stroke-width="3" stroke-linecap="round"/><path d="M60 103L65 107L70 103" fill="#936775"/><path d="M96 126Q135 121 112 103" fill="none" stroke="#B58E7C" stroke-width="14" stroke-linecap="round"/></g><rect x="129" y="104" width="34" height="37" rx="8" fill="#D8C4A9"/><path d="M164 110Q188 107 177 129L164 131" fill="none" stroke="#D8C4A9" stroke-width="6"/><path d="M137 92Q${130 + sway * 5} 81 139 67M151 91Q${160 + sway * 4} 76 150 58" fill="none" stroke="#D8C4A9" stroke-width="3" opacity=".6" stroke-linecap="round"/>`;
  if (name === "plot-twist") drawing += `<g transform="rotate(${sway * 4} 96 133)"><path d="M53 91H139L129 162H63Z" fill="#B96D7F"/><path d="M71 92L77 161M96 92V161M120 92L114 161" stroke="#E1C8AE" stroke-width="11"/><ellipse cx="96" cy="93" rx="43" ry="12" fill="#F0D7AD"/>${Array.from({ length: 8 }, (_, i) => `<circle cx="${62 + (i * 17) % 69}" cy="${85 - (i % 3) * 10}" r="10" fill="${i % 2 ? "#DDBE8E" : "#F0D7AD"}"/>`).join("")}<circle cx="80" cy="118" r="4" fill="#342D49"/><circle cx="110" cy="118" r="4" fill="#342D49"/><ellipse cx="96" cy="136" rx="7" ry="9" fill="#342D49"/></g><circle cx="${94 + sway * 12}" cy="${43 + Math.cos(t) * 15}" r="10" fill="#F0D7AD"/><circle cx="${50 - sway * 6}" cy="${60 - Math.cos(t) * 18}" r="7" fill="#DDBE8E"/>`;
  if (name === "big-win") drawing = `${Array.from({ length: 16 }, (_, i) => `<rect x="${12 + (i * 29) % 168}" y="${(i * 19 + frame * 8) % 180}" width="5" height="10" rx="2" transform="rotate(${i * 23} ${12 + (i * 29) % 168} ${(i * 19 + frame * 8) % 180})" fill="${["#B98EA8", "#C9AA78", "#91B4C1"][i % 3]}"/>`).join("")}<g transform="translate(0 ${bounce})"><path d="M58 61H34Q31 112 67 113M134 61H158Q161 112 125 113" fill="none" stroke="#B78D52" stroke-width="9"/><path d="M54 47H138L127 103Q96 135 65 103Z" fill="#CBA56B"/><path d="M96 115V145" stroke="#CBA56B" stroke-width="13"/><rect x="67" y="143" width="58" height="12" rx="5" fill="#CBA56B"/><path d="M96 63L101 76L115 77L104 86L108 100L96 92L84 100L88 86L77 77L91 76Z" fill="#EEE0B6"/></g>`;
  if (name === "on-my-way") drawing = `<g transform="translate(0 ${frame * 9 % 24})">${stars(frame)}</g><g transform="translate(${sway * 4} ${bounce}) rotate(-22 96 96)"><path d="M82 122L96 ${152 + Math.cos(t * 2) * 12}L110 122Z" fill="#D9A46C"/><path d="M89 124L96 ${140 + Math.cos(t * 2) * 7}L103 124Z" fill="#F1D5A0"/><path d="M75 89L58 132L78 123M117 89L134 132L114 123" fill="#AD7B92"/><path d="M75 117V80Q76 48 96 32Q116 48 117 80V117Z" fill="#CBCFDA"/><circle cx="96" cy="81" r="15" fill="#5C7592"/><circle cx="92" cy="77" r="5" fill="#B7D0DC"/><path d="M77 108H115" stroke="#AD7B92" stroke-width="8"/></g>`;
  if (name === "recharge") drawing += `<circle cx="136" cy="51" r="27" fill="#DDC29A"/><circle cx="149" cy="42" r="23" fill="#282D45"/><g transform="translate(0 ${bounce / 2})"><path d="M44 143Q20 142 27 120Q31 103 48 106Q50 78 77 80Q105 77 113 102Q142 92 154 113Q177 113 171 135Q168 146 147 146Z" fill="#B7BAD0"/><path d="M69 119Q76 125 83 119M104 119Q111 125 118 119" fill="none" stroke="#55576F" stroke-width="3" stroke-linecap="round"/><path d="M89 134H99" stroke="#55576F" stroke-width="3" stroke-linecap="round"/></g><g transform="translate(${sway * 3} ${-frame * 2})" fill="none" stroke="#A39FB9" stroke-width="3" stroke-linejoin="round" opacity="${1 - frame / 18}"><path d="M41 82H51L41 92H51M57 60H71L57 74H71"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192"><rect width="192" height="192" rx="18" fill="${bg}"/>${drawing}</svg>`;
}
for (const name of gifNames) {
  const frames = [];
  for (let frame = 0; frame < 12; frame++) frames.push(await sharp(Buffer.from(scene(name, frame))).ensureAlpha().raw().toBuffer());
  const image = sharp(Buffer.concat(frames), { raw: { width: 192, height: 192 * 12, channels: 4, pageHeight: 192 } });
  await writeFile(`public/gifs/circlo-${name}-v2.gif`, await image.gif({ colours: 96, loop: 0, delay: Array(12).fill(100) }).toBuffer());
  await writeFile(`public/gifs/circlo-${name}-v2.png`, await sharp(frames[0], { raw: { width: 192, height: 192, channels: 4 } }).png().toBuffer());
}
console.log("Generated six transparent stickers and six distinct animated GIF scenes.");
