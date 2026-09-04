"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import Logo from "@/components/ui/logo";

export default function Header() {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY.current;
      // Ignore tiny jitters and never hide while still near the top.
      if (Math.abs(delta) > 8) {
        setHidden(y > 80 && delta > 0);
        lastY.current = y;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 px-4 pt-4 transition-transform duration-300 sm:px-6 ${
        hidden ? "-translate-y-[calc(100%+1rem)]" : "translate-y-0"
      }`}
    >
      <div className="glass mx-auto flex max-w-5xl items-center justify-between rounded-2xl px-4 py-2.5 sm:px-5">
        <Link href="/" className="transition-opacity hover:opacity-80">
          <Logo />
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <SignedIn>
            <Link
              href="/watchlist"
              className="group relative text-white/70 transition-colors hover:text-white"
            >
              Watchlist
              <span className="absolute -bottom-1 left-0 h-px w-0 bg-pulse transition-all duration-300 group-hover:w-full" />
            </Link>
            <UserButton
              appearance={{
                elements: { avatarBox: "h-8 w-8 rounded-full ring-1 ring-white/15" },
              }}
            />
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="clay-pulse rounded-full px-4 py-1.5 text-sm font-semibold text-black transition-transform hover:scale-[1.03] active:scale-[0.98]">
                Sign in
              </button>
            </SignInButton>
          </SignedOut>
        </nav>
      </div>
    </header>
  );
}
