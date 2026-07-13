import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { AdminPage, type AdminSection } from '../../pages/AdminPage'

const sections = new Set<AdminSection>(['applications', 'reports', 'users', 'discovery', 'health', 'audit', 'administrators'])

export const Route = createFileRoute('/_authenticated/admin/$section')({
  beforeLoad: ({ context, params }) => {
    if (!context.user.adminRole) throw redirect({ to: '/feed', replace: true })
    if (!sections.has(params.section as AdminSection)) throw notFound()
    if (['administrators', 'discovery'].includes(params.section) && context.user.adminRole !== 'owner') throw redirect({ to: '/admin', replace: true })
  },
  component: AdminSectionPage,
})

function AdminSectionPage() {
  const { section } = Route.useParams()
  return <AdminPage section={section as AdminSection} />
}
