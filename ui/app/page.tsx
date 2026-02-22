import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight,
  Route,
  Mail,
  Clock,
  Shield,
  Users,
  Sparkles,
  MapPin,
  ChevronRight,
  ArrowUpRight,
  CheckCircle2,
} from "lucide-react"
import { Button } from "@/components/ui/button"

const PROCESS_STEPS = [
  {
    number: "01",
    title: "Submit Your Load",
    description:
      "Enter your origin, destination, and cargo details. Our AI instantly analyzes the route for optimal relay segmentation.",
    icon: MapPin,
  },
  {
    number: "02",
    title: "AI Segments the Route",
    description:
      "The dispatcher engine breaks the haul into HOS-legal relay legs, snapping handoffs to real truck stops along the corridor.",
    icon: Route,
  },
  {
    number: "03",
    title: "Drivers Get Matched",
    description:
      "Each leg is matched to the nearest available driver by proximity, HOS hours, trailer type, and corridor experience.",
    icon: Users,
  },
  {
    number: "04",
    title: "Gaps Get Filled",
    description:
      "If a leg goes unclaimed, AI drafts personalized outreach to your broker network. Every load gets covered.",
    icon: Mail,
  },
]

const TESTIMONIALS = [
  {
    quote:
      "FreightBite turned my solo operation into something that actually scales. I never drive past my hours anymore.",
    name: "Marcus Thompson",
    role: "Independent Owner-Operator",
    location: "Denver, CO",
  },
  {
    quote:
      "We submitted a 2,000-mile load and had all four relay legs assigned within 20 minutes. Unreal.",
    name: "Rachel Chen",
    role: "Logistics Manager",
    location: "Swift Brokerage, Chicago",
  },
  {
    quote:
      "The What's Next engine alone pays for itself. It found me a $3.50/mi backhaul I would have missed.",
    name: "Carlos Ramirez",
    role: "Flatbed Specialist",
    location: "Salt Lake City, UT",
  },
]

const FEATURES_GRID = [
  {
    title: "HOS-Legal Segmentation",
    description: "Every relay leg respects federal Hours of Service regulations. No exceptions, no workarounds.",
    icon: Shield,
  },
  {
    title: "Real-Time Matching",
    description: "Drivers are matched by proximity, available hours, trailer compatibility, and corridor familiarity.",
    icon: Clock,
  },
  {
    title: "AI Email Outreach",
    description: "When gaps appear, AI drafts personalized emails to your broker contacts, referencing past load history.",
    icon: Mail,
  },
  {
    title: "Decision Intelligence",
    description: "After each leg, drivers get AI recommendations: drive home or grab a high-pay load nearby.",
    icon: Sparkles,
  },
]

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background overflow-hidden">
      {/* Navigation — Awwwards-style minimal */}
      <nav className="relative z-20 mx-auto flex h-16 max-w-7xl items-center justify-between border-b border-border/60 px-6">
        <Link href="/" className="flex items-center">
          <Image src="/logo.svg" alt="FreightBite" width={64} height={64} />
        </Link>
        <div className="hidden md:flex items-center gap-10">
          <Link href="#process" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">
            How It Works
          </Link>
          <Link href="#features" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">
            Features
          </Link>
          <Link href="#testimonials" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">
            Testimonials
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground text-[13px]">
            <Link href="/driver">Drivers</Link>
          </Button>
          <Button asChild size="sm" className="rounded-full px-5 text-[13px] bg-foreground text-background hover:bg-foreground/90">
            <Link href="/shipper">Get Started</Link>
          </Button>
        </div>
      </nav>

      {/* Hero — Site of the Day style */}
      <section className="mx-auto max-w-7xl px-6 pt-20 pb-16 lg:pt-28 lg:pb-24">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
              AI-Powered Freight Relay
            </span>
            <span className="text-xs text-muted-foreground">2026</span>
          </div>
          <h1 className="max-w-4xl font-serif text-4xl font-medium leading-[1.12] text-foreground sm:text-5xl lg:text-6xl xl:text-7xl">
            Every load delivered.{" "}
            <span className="italic text-primary">No driver drives alone.</span>
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-muted-foreground lg:text-lg">
            Our AI dispatcher breaks long-haul freight into relay legs, matches
            nearby drivers, and fills gaps through your broker network.
            Think DoorDash for solo truckers.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="rounded-full px-7 text-sm font-medium bg-foreground text-background hover:bg-foreground/90 gap-2">
              <Link href="/shipper">Submit a Load <ArrowRight className="h-4 w-4" /></Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-full px-7 text-sm font-medium border-border hover:bg-secondary gap-2">
              <Link href="/driver">Driver Dashboard <ChevronRight className="h-4 w-4" /></Link>
            </Button>
          </div>
        </div>

        {/* Stats — compact editorial row */}
        <div className="mt-24 grid grid-cols-2 gap-8 border-t border-border pt-12 lg:grid-cols-4">
          {[
            { value: "2,015", label: "Miles covered", sub: "Melrose Park, IL → Rialto, CA" },
            { value: "4", label: "Relay legs", sub: "11-hr drive / 14-hr window" },
            { value: "$1.82", label: "Avg rate/mi", sub: "vs $1.60 market avg" },
            { value: "38.4k", label: "Pounds moved", sub: "Consumer electronics, dry van" },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="font-serif text-3xl font-medium text-foreground lg:text-4xl">{stat.value}</p>
              <p className="mt-1 text-sm font-medium text-foreground">{stat.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{stat.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* The Process — Nominees / Latest style card grid */}
      <section id="process" className="border-t border-border bg-secondary/30">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
          <div className="mb-14 flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-primary">The Process</p>
            <h2 className="font-serif text-2xl font-medium text-foreground lg:text-4xl">
              From submission to delivery, beautifully orchestrated.
            </h2>
          </div>

          <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {PROCESS_STEPS.map((step) => (
              <div
                key={step.number}
                className="group flex flex-col bg-card p-8 transition-colors hover:bg-secondary/50"
              >
                <div className="mb-6 flex items-center justify-between">
                  <span className="font-serif text-4xl font-medium text-border group-hover:text-primary/40 transition-colors">
                    {step.number}
                  </span>
                  <step.icon className="h-5 w-5 text-primary/70" />
                </div>
                <h3 className="mb-2 text-base font-semibold text-foreground">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground flex-1">{step.description}</p>
                <p className="mt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">by FreightBite</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features — Winners / Recent style */}
      <section id="features" className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
          <div className="mb-14 flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-primary">Capabilities</p>
            <h2 className="max-w-2xl font-serif text-2xl font-medium text-foreground lg:text-4xl leading-tight">
              Built for the realities of the road.
            </h2>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES_GRID.map((feature) => (
              <Link
                key={feature.title}
                href="/shipper"
                className="group flex flex-col rounded-xl border border-border bg-card p-6 transition-all duration-200 hover:border-primary/20 hover:shadow-md hover:shadow-primary/5"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mb-2 text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground flex-1">{feature.description}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                  View <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            ))}
          </div>

          <div className="mt-12 flex justify-start">
            <Button asChild className="rounded-full px-6 bg-foreground text-background hover:bg-foreground/90 gap-2" size="sm">
              <Link href="/shipper">Try It Free <ArrowUpRight className="h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Testimonials — card grid with byline */}
      <section id="testimonials" className="border-t border-border bg-secondary/30">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
          <div className="mb-14 flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-primary">Trusted by Drivers & Shippers</p>
            <h2 className="font-serif text-2xl font-medium text-foreground lg:text-4xl">
              Hear from the road.
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <div
                key={i}
                className="flex flex-col rounded-xl border border-border bg-card p-7 transition-all duration-200 hover:shadow-md hover:shadow-primary/5"
              >
                <span className="font-serif text-4xl leading-none text-primary/25" aria-hidden="true">{'\u201C'}</span>
                <p className="mt-4 text-[15px] leading-relaxed text-foreground">{t.quote}</p>
                <div className="mt-8 flex items-center gap-3 border-t border-border pt-6">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
                    {t.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role} · {t.location}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-foreground">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:py-24 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-background/50">Start Today</p>
          <h2 className="mt-4 mx-auto max-w-2xl font-serif text-2xl font-medium text-background lg:text-4xl leading-snug">
            Ready to move freight the smarter way?
          </h2>
          <p className="mt-6 mx-auto max-w-md text-sm text-background/60 leading-relaxed">
            No contracts. No fleet required. Start dispatching loads in under 30 seconds with AI relay matching.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Button asChild size="lg" className="rounded-full px-7 bg-background text-foreground hover:bg-background/90 gap-2">
              <Link href="/shipper">Get Started Free <ArrowRight className="h-4 w-4" /></Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-full px-7 border-background/50 bg-transparent text-background hover:bg-background/10 hover:text-background">
              <Link href="/driver">Explore Dashboard</Link>
            </Button>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-8 text-xs text-background/40">
            <span className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5" /> Free to start</span>
            <span className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5" /> No credit card</span>
            <span className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5" /> HOS compliant</span>
          </div>
        </div>
      </section>

      {/* Footer — Awwwards-style multi-column */}
      <footer className="border-t border-border bg-background">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <Link href="/" className="flex items-center">
                <Image src="/logo.svg" alt="FreightBite" width={52} height={52} />
              </Link>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
                AI-powered freight relay platform. Every load delivered, no driver drives alone.
              </p>
            </div>
            <div>
              <h4 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground">Platform</h4>
              <ul className="flex flex-col gap-3">
                {["Shipper Portal", "Driver Dashboard", "AI Dispatch", "Email Outreach"].map((link) => (
                  <li key={link}>
                    <Link href="/shipper" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{link}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground">Drivers</h4>
              <ul className="flex flex-col gap-3">
                {["Find Loads", "What's Next", "HOS Compliance", "Rate Calculator"].map((link) => (
                  <li key={link}>
                    <Link href="/driver" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{link}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground">Company</h4>
              <ul className="flex flex-col gap-3">
                {["About", "Blog", "Careers", "Contact"].map((link) => (
                  <li key={link}>
                    <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{link}</Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 sm:flex-row">
            <p className="text-xs text-muted-foreground">© 2026 FreightBite. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy</Link>
              <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms</Link>
              <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">FMCSA Compliance</Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}
