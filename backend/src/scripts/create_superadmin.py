#!/usr/bin/env python3
"""Create a superadmin user (no organization).

Usage:
    python -m src.scripts.create_superadmin --email admin@egglogu.com --name "Jose Antonio"

Password is read from stdin (or --password flag for non-interactive use).
"""

import argparse
import asyncio
import getpass
import sys

from sqlalchemy import select

# Ensure project root is importable
sys.path.insert(0, ".")

from src.core.security import hash_password, validate_password, WeakPasswordError
from src.database import async_session
from src.models.auth import Role, User


async def create_superadmin(email: str, full_name: str, password: str) -> None:
    async with async_session() as db:
        # Check if already exists
        existing = await db.execute(select(User).where(User.email == email))
        if existing.scalar_one_or_none():
            print(f"ERROR: User with email '{email}' already exists.")
            sys.exit(1)

        try:
            validate_password(password)
        except WeakPasswordError as e:
            print(f"ERROR: {e}")
            sys.exit(1)

        user = User(
            email=email,
            full_name=full_name,
            hashed_password=hash_password(password),
            role=Role.superadmin,
            organization_id=None,
            is_active=True,
            email_verified=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        print("Superadmin created successfully:")
        print(f"  ID:    {user.id}")
        print(f"  Email: {user.email}")
        print(f"  Name:  {user.full_name}")
        print(f"  Role:  {user.role.value}")
        print("  Org:   None (platform-level)")


def main():
    parser = argparse.ArgumentParser(description="Create EGGlogU superadmin user")
    parser.add_argument("--email", required=True, help="Superadmin email")
    parser.add_argument("--name", required=True, help="Full name")
    parser.add_argument("--password", default=None, help="Password (or enter via stdin)")
    args = parser.parse_args()

    password = args.password
    if not password:
        password = getpass.getpass("Enter superadmin password: ")
        confirm = getpass.getpass("Confirm password: ")
        if password != confirm:
            print("ERROR: Passwords do not match.")
            sys.exit(1)

    asyncio.run(create_superadmin(args.email, args.name, password))


if __name__ == "__main__":
    main()
