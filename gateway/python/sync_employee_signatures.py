#!/usr/bin/env python3
import json
import os
import tempfile
import urllib.request
from pathlib import Path

BASE_URL = os.environ.get(
    "ZP_SIGNATURE_BUNDLE_BASE",
    "https://zdrowa-polska.github.io/zdrowa-polska-signatures/gateway-signatures",
).rstrip("/")
OUTPUT = Path(os.environ.get(
    "ZP_EMPLOYEE_SIGNATURES_FILE",
    "/opt/zp-signature-gateway/employee-signatures.json",
))
CORPORATE_DOMAIN = os.environ.get("ZP_CORPORATE_DOMAIN", "zdrowapolskagroup.pl").lower()


def fetch_json(url):
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "Zdrowa-Polska-Signature-Gateway/1.0"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def main():
    manifest = fetch_json(BASE_URL + "/manifest.json")
    items = manifest.get("signatures", [])

    signatures = {}
    for item in items:
        filename = str(item.get("file", ""))
        if not filename.endswith(".json") or "/" in filename or "\\" in filename:
            continue

        payload = fetch_json(BASE_URL + "/" + filename)
        email = str(payload.get("email", "")).strip().lower()

        if not email.endswith("@" + CORPORATE_DOMAIN):
            continue
        if not payload.get("html") or not payload.get("text"):
            continue

        signatures[email] = {
            "html": str(payload["html"]),
            "text": str(payload["text"]),
        }

    if not signatures:
        raise RuntimeError("refusing to replace local signature cache with an empty bundle")

    output = {
        "version": 1,
        "source": BASE_URL,
        "signatures": signatures,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    fd, temp_name = tempfile.mkstemp(
        prefix=OUTPUT.name + ".",
        dir=str(OUTPUT.parent),
        text=True,
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(output, handle, ensure_ascii=False, separators=(",", ":"))
            handle.write("\n")
        os.chmod(temp_name, 0o640)
        os.replace(temp_name, OUTPUT)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)

    print(f"Updated {OUTPUT}: {len(signatures)} employee signatures")


if __name__ == "__main__":
    main()
