"use client"
import Link from "next/link"

export function Header() {
  return (
    <header className="border-b-2 border-black bg-white">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <div className="text-2xl font-bold font-mono tracking-tight">
                <span className="text-black">Alpha</span>
              </div>
              <div className="text-xl font-bold font-mono tracking-tight">
                <span className="text-black">Arena</span>
              </div>
              <span className="text-xs text-muted-foreground font-mono ml-1">by Nof0</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1 font-mono text-sm font-bold">
              <Link href="/" className="px-3 hover:bg-secondary transition-colors">
                LIVE
              </Link>
              <span className="text-muted-foreground">|</span>
              <Link href="/leaderboard" className="px-3 hover:bg-secondary transition-colors">
                LEADERBOARD
              </Link>
              <span className="text-muted-foreground">|</span>
              <Link href="/models" className="px-3 hover:bg-secondary transition-colors">
                MODELS
              </Link>
              <span className="text-muted-foreground">|</span>
              <Link href="/pricing" className="px-3 hover:bg-secondary transition-colors">
                PRICING
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4 font-mono text-xs font-bold">
            <Link
              href="/dashboard"
              className="border-2 border-black bg-white px-4 py-2 font-mono text-sm hover:bg-gray-100 transition-colors"
            >
              MANAGE ACCOUNTS
            </Link>
            <Link href="/about" className="hover:underline">
              ABOUT Nof0
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}
