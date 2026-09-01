import { AuthNav } from "@/components/AuthNav";
import { SystemHealthPanel } from "@/components/SystemHealth";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-10">
      <div className="flex justify-end">
        <AuthNav />
      </div>

      <main className="flex flex-1 flex-col items-center justify-center gap-10">
        <header className="text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">InfraGuard AI</h1>
          <p className="mt-3 text-lg text-slate-500 dark:text-slate-400">
            AI-powered infrastructure intelligence and incident management platform.
          </p>
          <p className="mt-2 text-sm font-medium uppercase tracking-wide text-slate-400">
            v0.2 · Authentication &amp; Identity
          </p>
        </header>

        <SystemHealthPanel />

        <footer className="text-center text-xs text-slate-400">
          Health data is retrieved live from the backend API. Database status
          reflects a real PostgreSQL connectivity check.
        </footer>
      </main>
    </div>
  );
}
