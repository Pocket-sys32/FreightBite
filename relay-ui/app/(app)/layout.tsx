import { AppNav } from "@/components/app-nav"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="driver-dark min-h-screen bg-background text-foreground">
      <AppNav />
      <main className="mx-auto max-w-3xl px-5 py-6 lg:py-8">
        {children}
      </main>
    </div>
  )
}
