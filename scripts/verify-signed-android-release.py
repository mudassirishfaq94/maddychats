"""Inspect a signed release AAB against explicit public identity; never reads private keys."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import ssl
import xml.etree.ElementTree as ET
import zipfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("aab", "certificate", "bundletool", "output"):
        parser.add_argument("--" + name, required=True)
    parser.add_argument("--package", default="chat.circlo.app")
    parser.add_argument("--version-code", type=int, default=15)
    parser.add_argument("--version-name", default="0.9.6")
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location("artifact_inspector", Path(__file__).with_name("inspect-android-build.py"))
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    if helper.digest(args.bundletool) != "a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29":
        raise ValueError("Unverified bundletool input")
    java_bin = Path(os.environ["JAVA_HOME"]) / "bin"
    verification = helper.run([java_bin / "jarsigner.exe", "-J-Duser.language=en", "-verify", "-verbose", "-certs", args.aab])
    if "jar verified." not in verification or "unsigned entries" in verification.lower():
        raise ValueError("Missing/invalid signature or unsigned entries")
    cert_text = helper.run([java_bin / "keytool.exe", "-printcert", "-rfc", "-jarfile", args.aab])
    certificates = re.findall(r"-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----", cert_text, re.S)
    if len(certificates) != 1:
        raise ValueError("Expected exactly one approved upload signer")
    signer_der = ssl.PEM_cert_to_DER_cert(certificates[0])
    expected_der = ssl.PEM_cert_to_DER_cert(Path(args.certificate).read_text(encoding="ascii"))
    if signer_der != expected_der:
        raise ValueError("Signer differs from approved upload certificate")
    tool = [java_bin / "java.exe", "-jar", args.bundletool]
    helper.run(tool + ["validate", "--bundle=" + args.aab])
    manifest = ET.fromstring(helper.run(tool + ["dump", "manifest", "--bundle=" + args.aab, "--module=base"]))
    ns = "{http://schemas.android.com/apk/res/android}"
    app = manifest.find("application")
    if manifest.get("package") != args.package or int(manifest.get(ns + "versionCode")) != args.version_code or manifest.get(ns + "versionName") != args.version_name:
        raise ValueError("Unapproved package/version")
    target = int(manifest.find("uses-sdk").get(ns + "targetSdkVersion"))
    if target < 36 or app.get(ns + "debuggable", "false") != "false" or app.get(ns + "usesCleartextTraffic") != "false" or app.get(ns + "allowBackup") != "false":
        raise ValueError("Unsafe release target/debug/network/backup configuration")
    permissions = [node.get(ns + "name") for node in manifest.findall("uses-permission")]
    forbidden = ("READ_MEDIA_", "READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE", "CAMERA", "USE_FULL_SCREEN_INTENT", "RECEIVE_BOOT_COMPLETED", "USE_BIOMETRIC")
    if any(part in permission for permission in permissions for part in forbidden):
        raise ValueError("Unexpected broad sensitive permission")
    with zipfile.ZipFile(args.aab) as archive:
        names = archive.namelist()
        if not any(re.match(r"META-INF/.*\.SF$", name, re.I) for name in names) or not any(re.match(r"META-INF/.*\.RSA$", name, re.I) for name in names):
            raise ValueError("Signature block files absent")
        libraries = helper.native_alignment(archive)
    record = {
        "package": args.package, "versionCode": args.version_code, "versionName": args.version_name,
        "aabFileName": Path(args.aab).name, "sha256": helper.digest(args.aab), "bytes": Path(args.aab).stat().st_size,
        "signed": True, "signatureVerified": True, "signerMatchesApprovedUploadCertificate": True,
        "uploadCertificateSha256": hashlib.sha256(signer_der).hexdigest(), "bundletoolValidated": True,
        "targetSdk": target, "debuggable": False, "permissions": permissions, "nativeLibraries": libraries,
        "timestampAuthorityUsed": False, "physicalDeviceVerified": False, "playSubmissionApproved": False,
        "note": "Cryptographic/build verification only; compliance and live configuration gates are separate.",
    }
    Path(args.output).write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"signed": True, "signatureVerified": True, "package": args.package, "versionCode": args.version_code, "targetSdk": target}))


if __name__ == "__main__":
    main()
