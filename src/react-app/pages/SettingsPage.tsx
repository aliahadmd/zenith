import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { apiPut } from '../lib/api'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'

export function SettingsPage() {
  // ── Avatar ──────────────────────────────────────────────────────────────
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [avatarLoading, setAvatarLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setAvatarFile(file)
    setAvatarError(null)
    if (file) {
      setAvatarPreview(URL.createObjectURL(file))
    }
  }

  async function handleAvatarSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!avatarFile) return
    setAvatarError(null)
    setAvatarLoading(true)
    const formData = new FormData()
    formData.append('avatar', avatarFile)
    const { error, status } = await apiPut('/api/settings/avatar', formData)
    setAvatarLoading(false)
    if (error) {
      if (status === 413) setAvatarError('File too large. Maximum size is 5 MB.')
      else if (status === 415) setAvatarError('Unsupported file type. Use JPEG, PNG, or WebP.')
      else setAvatarError(error)
    } else {
      toast.success('Avatar updated successfully.')
    }
  }

  // ── Password ─────────────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordLoading, setPasswordLoading] = useState(false)

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError(null)
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.')
      return
    }
    setPasswordLoading(true)
    const { error } = await apiPut('/api/settings/password', { currentPassword, newPassword })
    setPasswordLoading(false)
    if (error) {
      setPasswordError(error)
    } else {
      toast.success('Password updated successfully.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  // ── Email ─────────────────────────────────────────────────────────────────
  const [newEmail, setNewEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailLoading, setEmailLoading] = useState(false)

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setEmailError(null)
    setEmailLoading(true)
    const { error } = await apiPut('/api/settings/email', { newEmail, currentPassword: emailPassword })
    setEmailLoading(false)
    if (error) {
      setEmailError(error)
    } else {
      toast.success('Email updated successfully.')
      setNewEmail('')
      setEmailPassword('')
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Avatar */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Picture</CardTitle>
          <CardDescription>Upload a new profile picture (JPEG, PNG, or WebP, max 5 MB)</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAvatarSubmit} className="space-y-4">
            {avatarPreview && (
              <img
                src={avatarPreview}
                alt="Avatar preview"
                className="h-24 w-24 rounded-full object-cover"
              />
            )}
            <div className="space-y-2">
              <Label htmlFor="avatar">Choose image</Label>
              <Input
                id="avatar"
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
              />
            </div>
            {avatarError && <p className="text-sm text-destructive">{avatarError}</p>}
            <Button type="submit" disabled={!avatarFile || avatarLoading}>
              {avatarLoading ? 'Uploading…' : 'Upload'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your account password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
            <Button type="submit" disabled={passwordLoading}>
              {passwordLoading ? 'Updating…' : 'Update password'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Email */}
      <Card>
        <CardHeader>
          <CardTitle>Change Email</CardTitle>
          <CardDescription>Update the email address linked to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newEmail">New email address</Label>
              <Input
                id="newEmail"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emailPassword">Current password</Label>
              <Input
                id="emailPassword"
                type="password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {emailError && <p className="text-sm text-destructive">{emailError}</p>}
            <Button type="submit" disabled={emailLoading}>
              {emailLoading ? 'Updating…' : 'Update email'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
