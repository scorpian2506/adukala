"use client";

import Link from "next/link";
import { useAccount } from "@/lib/account";

/** Says who sees this page's data: the household when signed in, only this phone otherwise. */
export function SharedNote({ what }: { what: string }) {
  const acct = useAccount();
  if (acct.status === "loading") return null;
  if (acct.status !== "in")
    return (
      <p className="text-[12px] text-ink-3" data-testid="shared-note">
        Only on this phone.{" "}
        <Link href="/account" className="underline underline-offset-2">
          Sign in
        </Link>{" "}
        to share {what} with your family.
      </p>
    );
  const others = (acct.household?.members ?? []).filter((m) => m.username !== acct.user?.username).map((m) => m.displayName);
  return (
    <p className="text-[12px] text-ink-3" data-testid="shared-note">
      <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-leaf align-middle" />
      {others.length ? `Shared with ${others.join(", ")}` : "Shared with your household"}
      {others.length ? "" : (
        <>
          {" · "}
          <Link href="/account" className="underline underline-offset-2">
            invite someone
          </Link>
        </>
      )}
      {acct.syncError ? " · not synced yet" : ""}
    </p>
  );
}
