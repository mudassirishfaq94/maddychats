"""Read-only Phase2 APK/unsigned-AAB verification. Requires existing SDK/JDK and pinned bundletool."""
import argparse
import hashlib
import json
import os
import re
import struct
import subprocess
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

def run(command):
    result = subprocess.run([str(part) for part in command], capture_output=True, text=True, encoding="utf8", errors="replace")
    if result.returncode: raise RuntimeError("Artifact tool failed: " + Path(str(command[0])).name)
    return result.stdout

def digest(path):
    with open(path, "rb") as source: return hashlib.file_digest(source, "sha256").hexdigest()

def native_alignment(archive):
    result = []
    for name in archive.namelist():
        if not name.endswith(".so") or "/lib/" not in "/" + name: continue
        data = archive.read(name)
        if data[:4] != b"\x7fELF": raise ValueError("Native library is not ELF")
        is64 = data[4] == 2
        endian = "<" if data[5] == 1 else ">"
        phoff = struct.unpack_from(endian + ("Q" if is64 else "I"), data, 32 if is64 else 28)[0]
        size, count = struct.unpack_from(endian + "HH", data, 54 if is64 else 42)
        alignments = []
        for index in range(count):
            start = phoff + index * size
            if struct.unpack_from(endian + "I", data, start)[0] == 1:
                alignments.append(struct.unpack_from(endian + ("Q" if is64 else "I"), data, start + (48 if is64 else 28))[0])
        if not alignments or min(alignments) < 16384: raise ValueError("Native LOAD alignment below16KB: " + name)
        result.append({"path": name, "loadAlignments": alignments})
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apk", required=True)
    parser.add_argument("--aab", required=True)
    parser.add_argument("--bundletool", required=True)
    parser.add_argument("--package", default="app.ziptalks.android")
    parser.add_argument("--output", required=True, help="Write evidence to an ignored local path, not APK bytes/keys")
    args = parser.parse_args()
    sdk = Path(os.environ["ANDROID_HOME"])
    jdk = Path(os.environ["JAVA_HOME"])
    java = jdk / "bin/java.exe"
    tools = sdk / "build-tools/36.0.0"
    if digest(args.bundletool) != "a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29":
        raise ValueError("Expected official bundletool1.18.3 release SHA256")
    badging = run([tools / "aapt2.exe", "dump", "badging", args.apk])
    package = re.search(r"package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'", badging)
    if not package or package[1] != args.package: raise ValueError("Unexpected APK identity")
    signature = run([java, "-jar", tools / "lib/apksigner.jar", "verify", "--verbose", "--print-certs", args.apk])
    fingerprint = re.search(r"certificate SHA-256 digest: ([a-f0-9]+)", signature)[1]
    run([tools / "zipalign.exe", "-c", "-P", "16", "4", args.apk])
    run([java, "-jar", args.bundletool, "validate", "--bundle=" + args.aab])
    manifest = ET.fromstring(run([java, "-jar", args.bundletool, "dump", "manifest", "--bundle=" + args.aab, "--module=base"]))
    ns = "{http://schemas.android.com/apk/res/android}"
    app = manifest.find("application")
    target = int(manifest.find("uses-sdk").get(ns + "targetSdkVersion"))
    if manifest.get("package") != args.package or target < 36: raise ValueError("AAB identity/target SDK mismatch")
    if app.get(ns + "debuggable", "false") != "false" or app.get(ns + "usesCleartextTraffic") != "false": raise ValueError("Unsafe release manifest")
    if app.get(ns + "allowBackup") != "false" or not app.get(ns + "dataExtractionRules") or not app.get(ns + "fullBackupContent"): raise ValueError("Explicit backup/transfer exclusions missing")
    rules = run([tools / "aapt2.exe", "dump", "xmltree", args.apk, "--file", "res/xml/data_extraction_rules.xml"])
    domains = re.findall(r'domain="([a-z_]+)"', rules)
    expected_domains = ["root", "file", "database", "sharedpref", "external", "device_root", "device_file", "device_database", "device_sharedpref"]
    if "E: cloud-backup" not in rules or "E: device-transfer" not in rules or any(domains.count(domain) != 2 for domain in expected_domains): raise ValueError("Cloud/transfer exclusion coverage incomplete")
    permissions = [node.get(ns + "name") for node in manifest.findall("uses-permission")]
    forbidden = ["READ_MEDIA_", "READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE", "USE_BIOMETRIC", "RECEIVE_BOOT_COMPLETED", "CAMERA", "USE_FULL_SCREEN_INTENT"]
    if any(part in value for part in forbidden for value in permissions): raise ValueError("Unexpected broad permission in AAB")
    config = json.loads(run([java, "-jar", args.bundletool, "dump", "config", "--bundle=" + args.aab]))
    with zipfile.ZipFile(args.aab) as aab, zipfile.ZipFile(args.apk) as apk:
        signatures = [name for name in aab.namelist() if re.match(r"META-INF/.*\.(SF|RSA|DSA|EC)$", name, re.I)]
        if signatures: raise ValueError("Unexpected final AAB signing: Phase2 owner authorized no final signing")
        libraries = {"apk": native_alignment(apk), "aab": native_alignment(aab)}
        dex = [apk.read(name) for name in apk.namelist() if name.endswith(".dex")]
        if not any(b"https://circlo.chat" in data for data in dex): raise ValueError("Canonical hosted origin absent from APK")
    evidence = {"package": args.package, "versionCode": int(package[2]), "versionName": package[3], "apk": {"path": str(Path(args.apk).resolve()), "sha256": digest(args.apk), "bytes": Path(args.apk).stat().st_size, "signatureVerified": True, "certificateSha256": fingerprint, "debuggable": "application-debuggable" in badging, "zipAlignment16KB": True}, "aab": {"path": str(Path(args.aab).resolve()), "sha256": digest(args.aab), "bytes": Path(args.aab).stat().st_size, "bundletoolValidation": True, "targetSdk": target, "debuggable": False, "signed": False, "permissions": permissions, "bundleConfig": config}, "nativeLibraries": libraries, "physicalDeviceTestedByAgent": False, "playUploadReady": False}
    Path(args.output).write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf8")
    print(json.dumps({"apkSignatureVerified": True, "package": args.package, "targetSdk": target, "bundleValid": True, "aabSigned": False, "playUploadReady": False}))

if __name__ == "__main__": main()
