import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '../../pages/SettingsPage'

export const Route = createFileRoute('/_authenticated/settings_/profile')({
  component: () => <SettingsPage section="profile" />,
})
