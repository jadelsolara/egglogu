"""CLI to run seed data. Usage: python -m src.seeds.run_seeds [--demo] [--support]"""

import asyncio
import sys

from src.database import AsyncSessionLocal


async def run():
    args = set(sys.argv[1:])
    if not args or "--help" in args:
        print("Usage: python -m src.seeds.run_seeds [--demo] [--support] [--all]")
        return

    if "--all" in args:
        args = {"--demo", "--support"}

    async with AsyncSessionLocal() as db:
        if "--demo" in args:
            from src.seeds.demo_seed import seed_demo_data

            counts = await seed_demo_data(db)
            print(f"Demo seed complete: {counts}")

        if "--support" in args:
            from src.seeds.support_seed import seed_support_data

            counts = await seed_support_data(db)
            print(f"Support seed complete: {counts}")


if __name__ == "__main__":
    asyncio.run(run())
