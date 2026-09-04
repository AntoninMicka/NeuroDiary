#!/usr/bin/env python3
"""Create or update a NeuroDiary local account file using scrypt hashes."""
import argparse
import base64
import getpass
import hashlib
import json
import os
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("file", type=Path)
    parser.add_argument("username")
    parser.add_argument("--name", default="")
    parser.add_argument("--email", default="")
    args = parser.parse_args()
    password = getpass.getpass("Heslo: ")
    if len(password) < 12:
        raise SystemExit("Heslo musí mít alespoň 12 znaků.")
    if password != getpass.getpass("Heslo znovu: "):
        raise SystemExit("Hesla se neshodují.")

    document = {"version": 1, "users": []}
    if args.file.exists():
        document = json.loads(args.file.read_text(encoding="utf-8"))
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1, dklen=32)
    record = {
        "username": args.username,
        "userId": args.username,
        "name": args.name or args.username,
        "email": args.email,
        "password": {
            "algorithm": "scrypt", "n": 16384, "r": 8, "p": 1,
            "salt": base64.b64encode(salt).decode(),
            "hash": base64.b64encode(digest).decode(),
        },
    }
    users = [u for u in document.get("users", []) if str(u.get("username", "")).casefold() != args.username.casefold()]
    users.append(record)
    document = {"version": 1, "users": users}
    args.file.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.file.with_suffix(args.file.suffix + ".tmp")
    temporary.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.chmod(temporary, 0o600)
    temporary.replace(args.file)
    print(f"Uživatel {args.username} byl uložen do {args.file}.")


if __name__ == "__main__":
    main()
