import json, os, pathlib, subprocess, urllib.request, urllib.error
from collections import Counter
out=pathlib.Path("/tmp/security-audit"); out.mkdir(exist_ok=True)
for mode,args in [("history",["git",".","--log-opts=--all"]),("current",["dir","."])]:
    raw=out/(mode+"-raw.json")
    result=subprocess.run(["/tmp/gitleaks",*args,"--redact=100","--report-format=json","--report-path="+str(raw),"--exit-code=1"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    if result.returncode not in (0,1): raise RuntimeError("Secret scanner did not complete: "+mode)
    findings=json.loads(raw.read_text()) if raw.exists() else []
    safe=[{k:f.get(k) for k in ["RuleID","File","StartLine","Commit","Fingerprint"]} for f in findings]
    (out/(mode+"-findings.json")).write_text(json.dumps(safe,indent=2))
    raw.unlink(missing_ok=True)
    print("SECRET_SCAN_"+mode.upper()+"="+json.dumps({"count":len(safe),"rules":dict(Counter(f["RuleID"] for f in safe)),"findings":safe}))
    reviewed=set(json.loads(pathlib.Path("scripts/security-reviewed-findings.json").read_text())["fingerprints"])
    unexpected=[f for f in safe if f["Fingerprint"] not in reviewed]
    if unexpected: raise RuntimeError("Unreviewed secret-scan findings; review redacted metadata before release.")
routes=[]
for p in pathlib.Path("src/app/api").rglob("route.ts"):
    s=p.read_text()
    methods=[m for m in ["GET","POST","PUT","PATCH","DELETE"] if ("function "+m+"(" in s or "const "+m+" " in s or "const "+m+"=" in s)]
    routes.append({"path":str(p),"methods":methods,"session_guard":any(x in s for x in ["getSessionUser","requireAdmin","requireSuperAdmin","authorizeAdminMutation"]),"origin_guard":"guardSameOrigin" in s,"rate_limit":"rateLimit(" in s or "rateLimit (" in s})
(out/"routes.json").write_text(json.dumps(routes,indent=2))
print("ROUTE_INVENTORY="+json.dumps(routes))
paths=["/", "/login", "/circlo-landing.html", "/.env", "/.env.local", "/.git/HEAD", "/.git/config", "/package.json", "/package-lock.json", "/server/uploads/", "/api/admin/users", "/api/admin/stats", "/api/privacy/export"]
probes=[]
for path in paths:
    req=urllib.request.Request("https://circlo.chat"+path,headers={"User-Agent":"Circlo-authorized-security-review/1.0"})
    try:
        with urllib.request.urlopen(req,timeout=30) as r: status=r.status; headers=dict(r.headers); final=r.url
    except urllib.error.HTTPError as e: status=e.code; headers=dict(e.headers); final=e.url
    except Exception as e: probes.append({"path":path,"error":type(e).__name__}); continue
    selected={k:v for k,v in headers.items() if k.lower() in ["content-security-policy","content-security-policy-report-only","strict-transport-security","x-content-type-options","x-frame-options","referrer-policy","permissions-policy","x-powered-by","cache-control","content-type"]}
    probes.append({"path":path,"status":status,"url":final,"headers":selected})
(out/"public-probes.json").write_text(json.dumps(probes,indent=2))
print("PUBLIC_PROBES="+json.dumps(probes))
# Report names only; never values, including any future custom secret names.
env_refs=[]
import re
for p in pathlib.Path("src").rglob("*"):
    if p.suffix not in [".ts",".tsx",".js",".mjs"]: continue
    for name in sorted(set(re.findall(r"process\.env\.([A-Z0-9_]+)",p.read_text()))):
        env_refs.append({"path":str(p),"name":name})
(out/"environment-references.json").write_text(json.dumps(env_refs,indent=2))
print("PUBLIC_ENV_NAMES="+json.dumps(sorted({x["name"] for x in env_refs if x["name"].startswith("NEXT_PUBLIC_")})))

# Source-sink inventory contains filenames and line numbers only, never values.
sinks=[]
for p in pathlib.Path("src").rglob("*"):
    if p.suffix not in [".ts",".tsx",".js",".mjs"]: continue
    for n,line in enumerate(p.read_text().splitlines(),1):
        if any(x in line for x in ["dangerouslySetInnerHTML", ".innerHTML", "new Function(", "eval("]):
            sinks.append({"path":str(p),"line":n})
print("HTML_SINKS="+json.dumps(sinks))
all_source="\\n".join(p.read_text(errors="replace") for root in ["src","scripts"] for p in pathlib.Path(root).rglob("*") if p.is_file() and p.suffix in [".ts",".tsx",".js",".mjs"])
package=json.loads(pathlib.Path("package.json").read_text())
print("BCRYPTJS_IMPORT_USED="+json.dumps(any(x in all_source for x in ['from "bcryptjs"', "from 'bcryptjs'", 'require("bcryptjs")', "require('bcryptjs')", 'import("bcryptjs")', "import('bcryptjs')"])))
