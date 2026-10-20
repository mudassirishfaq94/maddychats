# -*- coding: utf-8 -*-
import os, re, json

root = "D:\downloads\maddychats-main (2)\maddychats-main"
plugins = ["@capacitor/app","@capacitor/camera","@capacitor/filesystem",
           "@capacitor/haptics","@capacitor/keyboard","@capacitor/local-notifications",
           "@capacitor/push-notifications","@capacitor/splash-screen","@capacitor/status-bar"]

class_re = re.compile(r"@(?:CapacitorPlugin|NativePlugin)[\s\S]*?class\s+(\w+)")
pkg_re = re.compile(r"^\s*package\s+([\w.]+)\s*;?\s*$")

entries = []
for p in plugins:
    base = os.path.join(root, "node_modules", p, "android", "src", "main")
    if not os.path.isdir(base):
        print(p, "-> no android/src/main"); continue
    found = False
    for dirpath, _, files in os.walk(base):
        for fn in files:
            if not (fn.endswith(".java") or fn.endswith(".kt")): continue
            fp = os.path.join(dirpath, fn)
            try:
                text = open(fp, encoding="utf-8", errors="replace").read()
            except Exception:
                continue
            if "@CapacitorPlugin" not in text and "@NativePlugin" not in text:
                continue
            cls = class_re.search(text)
            if not cls:
                print(p, "-> plugin annotation but no class match in", fn); continue
            pkg = None
            for line in text.splitlines():
                m = pkg_re.match(line.strip())
                if m: pkg = m.group(1); break
            if not pkg:
                print(p, "-> no package in", fn); continue
            fqcn = pkg + "." + cls.group(1)
            entries.append(fqcn)
            print(p, "->", fqcn)
            found = True
    if not found:
        print(p, "-> NO PLUGIN CLASS FOUND")

out = os.path.join(root, "android", "app", "src", "main", "assets", "capacitor.plugins.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(entries, f, indent="\t")
    f.write("\n")
print("WROTE", out, "with", len(entries), "entries")