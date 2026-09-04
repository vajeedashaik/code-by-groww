import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import Logo from "@/components/ui/logo";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 px-4 pt-4 sm:px-6">
      <div className="glass mx-auto flex max-w-5xl items-center justify-between rounded-2xl px-4 py-2.5 sm:px-5">
        <Link href="/" className="transition-opacity hover:opacity-80">
          <Logo />
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <SignedIn>
            <Link
              href="/dashboard"
              className="group relative text-white/70 transition-colors hover:text-white"
            >
              Dashboard
              <span className="absolute -bottom-1 left-0 h-px w-0 bg-pulse transition-all duration-300 group-hover:w-full" />
            </Link>
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
