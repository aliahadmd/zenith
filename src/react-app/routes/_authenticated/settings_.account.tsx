import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '../../pages/SettingsPage'

export const Route = createFileRoute('/_authenticated/settings_/account')({
  component: () => <SettingsPage section="account" />,
})
