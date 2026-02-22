import { AppNav } from "@/components/app-nav"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen min-h-[100dvh] bg-background text-foreground overflow-x-hidden w-full">
      <AppNav />
      <main className="mx-auto w-full max-w-3xl min-w-0 px-3 py-4 sm:px-5 sm:py-6 lg:py-8 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  )
}
