import Link from "next/link"
import {
  Truck,
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
      {/* Navigation */}
      <nav className="relative z-20 mx-auto flex h-20 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground">
            <Truck className="h-3.5 w-3.5 text-background" />
          </div>
          <span className="font-serif text-xl font-semibold tracking-tight text-foreground">
            FreightBite
          </span>
        </Link>
        <div className="hidden md:flex items-center gap-8">
          <Link href="#process" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            How It Works
          </Link>
          <Link href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Features
          </Link>
          <Link href="#testimonials" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Testimonials
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
            <Link href="/driver">Drivers</Link>
          </Button>
          <Button asChild size="sm" className="rounded-full px-5 bg-foreground text-background hover:bg-foreground/90">
            <Link href="/shipper">
              Get Started
            </Link>
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-6 pt-16 pb-24 lg:pt-24 lg:pb-36">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-6 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
            AI-Powered Freight Relay
          </p>
          <h1 className="text-balance font-serif text-5xl font-medium leading-[1.1] text-foreground sm:text-6xl lg:text-7xl">
            Every load delivered.{" "}
            <span className="italic text-primary">No driver drives alone.</span>
          </h1>
          <p className="mt-8 mx-auto max-w-xl text-pretty text-base leading-relaxed text-muted-foreground lg:text-lg">
            Our AI dispatcher breaks long-haul freight into relay legs, matches
            nearby drivers, and fills gaps through your broker network.
            Think DoorDash for solo truckers.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button
              asChild
              size="lg"
              className="h-13 rounded-full px-8 text-sm font-medium bg-foreground text-background hover:bg-foreground/90 gap-2"
            >
              <Link href="/shipper">
                Submit a Load
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-13 rounded-full px-8 text-sm font-medium border-border hover:bg-secondary gap-2"
            >
              <Link href="/driver">
                Driver Dashboard
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-24 grid grid-cols-2 gap-6 lg:grid-cols-4">
          {[
            { value: "2,015", label: "Miles covered", sub: "Melrose Park, IL to Rialto, CA" },
            { value: "4", label: "Relay legs", sub: "11-hr drive / 14-hr window compliant" },
            { value: "$1.82", label: "Avg rate/mi", sub: "vs $1.60 market avg (C.H. Robinson)" },
            { value: "38.4k", label: "Pounds moved", sub: "Consumer electronics, dry van" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="font-serif text-4xl font-medium text-foreground lg:text-5xl">
                {stat.value}
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {stat.label}
              </p>
              <p className="text-xs text-muted-foreground">{stat.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Divider */}
      <div className="mx-auto max-w-6xl px-6">
        <div className="h-px bg-border" />
      </div>

      {/* Process Section */}
      <section id="process" className="mx-auto max-w-6xl px-6 py-24 lg:py-32">
        <div className="mx-auto max-w-2xl text-center mb-20">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
            The Process
          </p>
          <h2 className="text-balance font-serif text-3xl font-medium text-foreground lg:text-5xl">
            From submission to delivery,{" "}
            <span className="italic">beautifully orchestrated.</span>
          </h2>
        </div>

        <div className="grid gap-0 md:grid-cols-2 lg:grid-cols-4">
          {PROCESS_STEPS.map((step, i) => (
            <div key={step.number} className="group relative flex flex-col px-8 py-10">
              {/* Vertical divider between cards on large screens */}
              {i > 0 && (
                <div className="absolute left-0 top-10 bottom-10 hidden w-px bg-border lg:block" />
              )}
              {/* Horizontal divider on small screens */}
              {i > 0 && (
                <div className="absolute left-8 right-8 top-0 h-px bg-border lg:hidden" />
              )}
              <span className="mb-6 font-serif text-5xl font-medium text-border group-hover:text-primary/30 transition-colors duration-500">
                {step.number}
              </span>
              <step.icon className="mb-4 h-5 w-5 text-primary" />
              <h3 className="mb-3 text-lg font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Divider */}
      <div className="mx-auto max-w-6xl px-6">
        <div className="h-px bg-border" />
      </div>

      {/* Features Grid */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-24 lg:py-32">
        <div className="grid gap-16 lg:grid-cols-2 items-start">
          <div className="lg:sticky lg:top-24">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
              Capabilities
            </p>
            <h2 className="text-balance font-serif text-3xl font-medium text-foreground lg:text-5xl leading-[1.15]">
              Built for the realities{" "}
              <span className="italic">of the road.</span>
            </h2>
            <p className="mt-6 text-base leading-relaxed text-muted-foreground max-w-md">
              Every feature is designed around the daily constraints solo truckers
              and small shippers actually face: HOS limits, empty miles, and broker relationships.
            </p>
            <Button
              asChild
              className="mt-8 rounded-full px-6 bg-foreground text-background hover:bg-foreground/90 gap-2"
            >
              <Link href="/shipper">
                Try It Free
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {FEATURES_GRID.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-2xl border border-border bg-card p-7 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5"
              >
                <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                  <feature.icon className="h-4.5 w-4.5 text-primary" />
                </div>
                <h3 className="mb-2 text-base font-semibold text-foreground">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="bg-secondary/60">
        <div className="mx-auto max-w-6xl px-6 py-24 lg:py-32">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
              Trusted by Drivers & Shippers
            </p>
            <h2 className="text-balance font-serif text-3xl font-medium text-foreground lg:text-5xl">
              Hear from the road.
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <div
                key={i}
                className="flex flex-col justify-between rounded-2xl border border-border bg-card p-8 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
              >
                {/* Quote mark */}
                <div>
                  <span className="font-serif text-5xl leading-none text-primary/30" aria-hidden="true">
                    {'\u201C'}
                  </span>
                  <p className="mt-2 text-base leading-relaxed text-foreground">
                    {t.quote}
                  </p>
                </div>
                <div className="mt-8 flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
                    {t.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {t.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.role} &middot; {t.location}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative overflow-hidden bg-foreground">
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
        <div className="relative mx-auto max-w-6xl px-6 py-24 lg:py-32 text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-background/50">
            Start Today
          </p>
          <h2 className="mx-auto max-w-2xl text-balance font-serif text-3xl font-medium text-background lg:text-5xl leading-[1.15]">
            Ready to move freight{" "}
            <span className="italic">the smarter way?</span>
          </h2>
          <p className="mt-6 mx-auto max-w-md text-base text-background/60 leading-relaxed">
            No contracts. No fleet required. Start dispatching loads in under
            30 seconds with AI relay matching.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button
              asChild
              size="lg"
              className="h-13 rounded-full px-8 text-sm font-medium bg-background text-foreground hover:bg-background/90 gap-2"
            >
              <Link href="/shipper">
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-13 rounded-full px-8 text-sm font-medium border-background/20 text-background hover:bg-background/10 gap-2"
            >
              <Link href="/driver">
                Explore Dashboard
              </Link>
            </Button>
          </div>
          <div className="mt-12 flex items-center justify-center gap-8 text-xs text-background/40">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Free to start</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>No credit card</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>HOS compliant</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-12 md:grid-cols-4">
            {/* Brand */}
            <div className="md:col-span-1">
              <Link href="/" className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground">
                  <Truck className="h-3 w-3 text-background" />
                </div>
                <span className="font-serif text-lg font-semibold text-foreground">
                  FreightBite
                </span>
              </Link>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground max-w-xs">
                AI-powered freight relay platform. Every load delivered, no driver
                drives alone.
              </p>
            </div>

            {/* Links */}
            <div>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-foreground">
                Platform
              </h4>
              <ul className="flex flex-col gap-3">
                {["Shipper Portal", "Driver Dashboard", "AI Dispatch", "Email Outreach"].map(
                  (link) => (
                    <li key={link}>
                      <Link
                        href="/shipper"
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {link}
                      </Link>
                    </li>
                  )
                )}
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-foreground">
                Drivers
              </h4>
              <ul className="flex flex-col gap-3">
                {["Find Loads", "What's Next", "HOS Compliance", "Rate Calculator"].map(
                  (link) => (
                    <li key={link}>
                      <Link
                        href="/driver"
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {link}
                      </Link>
                    </li>
                  )
                )}
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-foreground">
                Company
              </h4>
              <ul className="flex flex-col gap-3">
                {["About", "Blog", "Careers", "Contact"].map(
                  (link) => (
                    <li key={link}>
                      <Link
                        href="/"
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {link}
                      </Link>
                    </li>
                  )
                )}
              </ul>
            </div>
          </div>

          <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 sm:flex-row">
            <p className="text-xs text-muted-foreground">
              2026 FreightBite. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Privacy
              </Link>
              <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Terms
              </Link>
              <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                FMCSA Compliance
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}
