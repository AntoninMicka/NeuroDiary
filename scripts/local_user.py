#!/usr/bin/env python3
"""Manage the NeuroDiary local account file using scrypt password hashes."""
import argparse
import base64
import getpass
import hashlib
import json
import os
from pathlib import Path

ALLOWED_ROLES = {"patient", "family", "doctor", "admin"}


def read_document(path: Path) -> dict:
    if not path.exists():
        return {"version": 1, "users": []}
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise SystemExit(f"Soubor uživatelů nelze načíst: {error}") from error
    if document.get("version") != 1 or not isinstance(document.get("users"), list):
        raise SystemExit("Soubor uživatelů nemá podporovaný formát verze 1.")
    return document


def write_document(path: Path, document: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def password_record() -> dict:
    password = getpass.getpass("Heslo: ")
    if len(password) < 12:
        raise SystemExit("Heslo musí mít alespoň 12 znaků.")
    if password != getpass.getpass("Heslo znovu: "):
        raise SystemExit("Hesla se neshodují.")
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1, dklen=32)
    return {"algorithm": "scrypt", "n": 16384, "r": 8, "p": 1,
            "salt": base64.b64encode(salt).decode(), "hash": base64.b64encode(digest).decode()}


def parse_roles(value: str) -> list[str]:
    roles = list(dict.fromkeys(part.strip() for part in value.split(",") if part.strip()))
    if not roles or set(roles) - ALLOWED_ROLES:
        raise argparse.ArgumentTypeError(f"Role musí být neprázdný seznam z: {', '.join(sorted(ALLOWED_ROLES))}")
    return roles


def find_user(document: dict, username: str) -> dict:
    record = next((u for u in document["users"] if str(u.get("username", "")).casefold() == username.casefold()), None)
    if not record:
        raise SystemExit(f"Uživatel {username} nebyl nalezen.")
    return record


def ensure_admin_remains(users: list[dict]) -> None:
    def effective_roles(user: dict, index: int) -> list[str]:
        roles = user.get("roles")
        return roles if isinstance(roles, list) and roles else (["admin", "patient"] if index == 0 else ["patient"])

    if users and not any("admin" in effective_roles(user, index) for index, user in enumerate(users)):
        raise SystemExit("Operace by odstranila posledního administrátora.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Lokální správa uživatelů NeuroDiary")
    parser.add_argument("file", type=Path, help="Cesta k users.json")
    commands = parser.add_subparsers(dest="command", required=True)
    def add_account_arguments(command: argparse.ArgumentParser) -> None:
        command.add_argument("username"); command.add_argument("--name", default=""); command.add_argument("--email", default="")
        command.add_argument("--roles", type=parse_roles)

    add = commands.add_parser("add", help="Přidat uživatele"); add_account_arguments(add)
    upsert = commands.add_parser("upsert", help="Založit účet nebo změnit jeho heslo"); add_account_arguments(upsert)
    commands.add_parser("list", help="Vypsat uživatele")
    passwd = commands.add_parser("passwd", help="Změnit heslo"); passwd.add_argument("username")
    roles = commands.add_parser("roles", help="Změnit role"); roles.add_argument("username"); roles.add_argument("roles", type=parse_roles)
    delete = commands.add_parser("delete", help="Odstranit uživatele"); delete.add_argument("username")
    args = parser.parse_args()
    document = read_document(args.file)

    if args.command == "list":
        for user in document["users"]:
            print(f"{user.get('username', '')}\t{user.get('name', '')}\t{','.join(user.get('roles', []))}")
        return
    if args.command in {"add", "upsert"}:
        existing = next((u for u in document["users"] if str(u.get("username", "")).casefold() == args.username.casefold()), None)
        if existing and args.command == "add":
            raise SystemExit(f"Uživatel {args.username} už existuje.")
        if existing:
            existing["password"] = password_record()
            if args.name: existing["name"] = args.name
            if args.email: existing["email"] = args.email
            if args.roles:
                previous = existing.get("roles", [])
                existing["roles"] = args.roles
                try: ensure_admin_remains(document["users"])
                except SystemExit: existing["roles"] = previous; raise
        else:
            assigned = args.roles or (["admin", "patient"] if not document["users"] else ["patient"])
            document["users"].append({"username": args.username, "userId": args.username,
                "name": args.name or args.username, "email": args.email, "roles": assigned, "password": password_record()})
    elif args.command == "passwd":
        find_user(document, args.username)["password"] = password_record()
    elif args.command == "roles":
        record = find_user(document, args.username); previous = record.get("roles", []); record["roles"] = args.roles
        try: ensure_admin_remains(document["users"])
        except SystemExit: record["roles"] = previous; raise
    elif args.command == "delete":
        record = find_user(document, args.username)
        remaining = [user for user in document["users"] if user is not record]
        ensure_admin_remains(remaining); document["users"] = remaining

    write_document(args.file, document)
    print(f"Operace {args.command} byla úspěšně uložena do {args.file}.")


if __name__ == "__main__":
    main()
