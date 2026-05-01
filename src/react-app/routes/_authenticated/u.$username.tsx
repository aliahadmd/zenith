import { createFileRoute } from '@tanstack/react-router'
import { ProfilePage } from '../../pages/ProfilePage'

export const Route = createFileRoute('/_authenticated/u/$username')({
  component: ProfileRoute,
})

function ProfileRoute() {
  const { username } = Route.useParams()
  return <ProfilePage username={username} />
}
