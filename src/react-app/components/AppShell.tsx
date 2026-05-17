import { useEffect, useState } from 'react'
import { Outlet, useNavigate } from '@tanstack/react-router'
import { Menu } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { useAuth } from '../context/AuthContext'
import { Button } from './ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './ui/sheet'

export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const { currentUser, isLoading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && !currentUser) {
      void navigate({ to: '/login', replace: true })
    }
  }, [currentUser, isLoading, navigate])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar className="hidden lg:flex" />

      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden">
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Open navigation">
              <Menu data-icon="inline-start" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80 max-w-[85vw] p-0" showCloseButton>
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
              <SheetDescription>Main app navigation</SheetDescription>
            </SheetHeader>
            <Sidebar
              className="static h-full w-full border-r-0"
              onNavigate={() => setMobileNavOpen(false)}
            />
          </SheetContent>
        </Sheet>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Creator Network</p>
          <p className="truncate text-xs text-muted-foreground">Workspace</p>
        </div>
      </header>

      <main className="min-h-screen lg:pl-72">
        <div className="mx-auto w-full p-4 sm:p-6 lg:px-8 lg:py-0">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
