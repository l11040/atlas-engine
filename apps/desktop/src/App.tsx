import { Button } from "@/components/ui/button";

export default function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center gap-4 p-8">
      <p className="text-sm text-muted-foreground">Electron + React + Tailwind + shadcn/ui</p>
      <h1 className="text-4xl font-semibold tracking-tight">Atlas Desktop</h1>
      <Button>Start Building</Button>
    </main>
  );
}
