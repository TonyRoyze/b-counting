import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { ArrowUpRight, Blocks, Database, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

const convexUrl = import.meta.env.VITE_CONVEX_URL
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null

function Starter() {
  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden px-6 py-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
      <section className="relative w-full max-w-2xl text-center">
        <div className="mx-auto mb-8 flex size-16 items-center justify-center rounded-2xl border bg-card shadow-sm">
          <Blocks className="size-7 text-primary" aria-hidden="true" />
        </div>
        <p className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">A clean start</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">B-Counting</h1>
        <p className="mx-auto mt-6 max-w-lg text-lg leading-8 text-muted-foreground">
          Your new app workspace is ready. Build the next version from a fresh foundation.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Button asChild>
            <a href="https://docs.convex.dev" target="_blank" rel="noreferrer">
              Explore Convex <ArrowUpRight className="size-4" />
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href="https://ui.shadcn.com" target="_blank" rel="noreferrer">
              Browse components <ArrowUpRight className="size-4" />
            </a>
          </Button>
        </div>
        <div className="mt-16 grid gap-3 text-left sm:grid-cols-3">
          <SetupCard icon={<Sparkles />} title="React + Vite" detail="Fast TypeScript app foundation" />
          <SetupCard icon={<Blocks />} title="Tailwind + shadcn" detail="Ready for accessible UI components" />
          <SetupCard icon={<Database />} title="Convex" detail={convex ? 'Backend connected' : 'Add your deployment URL to connect'} />
        </div>
        {!convex && (
          <p className="mt-6 text-sm text-muted-foreground">
            Set <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">VITE_CONVEX_URL</code> in <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">.env.local</code> when you create a Convex deployment.
          </p>
        )}
      </section>
    </main>
  )
}

function SetupCard({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <div className="rounded-xl border bg-card/80 p-4">
      <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-muted text-primary [&_svg]:size-4">{icon}</div>
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  )
}

export default function App() {
  return convex ? (
    <ConvexProvider client={convex}><Starter /></ConvexProvider>
  ) : <Starter />
}
