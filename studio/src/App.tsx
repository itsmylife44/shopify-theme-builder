import { useEffect, useState } from 'react'
import type { Offense, ThemeState } from '../server/studio.mjs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; state: ThemeState }

export function App() {
  const [load, setLoad] = useState<Load>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/theme', { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error)
        setLoad({ status: 'ready', state: body })
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setLoad({ status: 'error', message: error.message })
      })
    return () => controller.abort()
  }, [])

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <h1 className="font-heading text-xl font-medium">Studio</h1>
      {load.status === 'loading' ? (
        <Skeleton className="h-64 w-full" />
      ) : load.status === 'error' ? (
        <Alert variant="destructive">
          <AlertTitle>The Studio could not read the Theme</AlertTitle>
          <AlertDescription>{load.message}</AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <HomePage sections={load.state.home} />
          <SectionCatalog sections={load.state.catalog} />
          <ThemeCheck offenses={load.state.validation} />
        </div>
      )}
    </main>
  )
}

function HomePage({ sections }: { sections: ThemeState['home'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Home page</CardTitle>
        <CardDescription>Sections in page order, from templates/index.json.</CardDescription>
      </CardHeader>
      <CardContent>
        {sections.length > 0 ? (
          <ol className="flex flex-col gap-2">
            {sections.map((section, index) => (
              <li key={section.id} className="flex items-center gap-3">
                <span className="w-5 text-right text-muted-foreground tabular-nums">{index + 1}</span>
                <span className="font-medium">{section.type}</span>
                <span className="truncate text-muted-foreground">{section.id}</span>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState title="No sections" description="The home page has no sections yet." />
        )}
      </CardContent>
    </Card>
  )
}

function SectionCatalog({ sections }: { sections: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Section Catalog</CardTitle>
        <CardDescription>Sections available to add to a page.</CardDescription>
      </CardHeader>
      <CardContent>
        {sections.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {sections.map((name) => (
              <li key={name}>
                <Badge variant="outline">{name}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Empty catalog" description="The Section Catalog has no sections yet." />
        )}
      </CardContent>
    </Card>
  )
}

function ThemeCheck({ offenses }: { offenses: Offense[] }) {
  const errors = offenses.filter((offense) => offense.severity === 'error').length
  const warnings = offenses.length - errors
  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle>Theme Check</CardTitle>
        <CardDescription>Errors and warnings in the Theme.</CardDescription>
        <CardAction className="flex gap-2">
          <Badge variant={errors > 0 ? 'destructive' : 'secondary'}>{plural(errors, 'error')}</Badge>
          <Badge variant="secondary">{plural(warnings, 'warning')}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        {offenses.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {offenses.map((offense, index) => (
              <li key={index} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Badge variant={offense.severity === 'error' ? 'destructive' : 'secondary'}>{offense.severity}</Badge>
                  <code className="truncate">
                    {offense.file}:{offense.line}
                  </code>
                  <span className="text-muted-foreground">{offense.check}</span>
                </div>
                <p>{offense.message}</p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No problems" description="Theme Check found no errors or warnings." />
        )}
      </CardContent>
    </Card>
  )
}

function plural(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
