import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { apiPut } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'

export function SettingsPage() {
  const { currentUser, refreshCurrentUser } = useAuth()

  // ── Public Profile ───────────────────────────────────────────────────────
  function parseSocialLinks(raw: string | null | undefined) {
    if (!raw) return { twitter: '', github: '', website: '' }
    try {
      const parsed = JSON.parse(raw) as Record<string, string>
      return {
        twitter: parsed.twitter ?? '',
        github: parsed.github ?? '',
        website: parsed.website ?? '',
      }
    } catch {
      return { twitter: '', github: '', website: '' }
    }
  }

  const initialLinks = parseSocialLinks(currentUser?.socialLinks)
  const [displayName, setDisplayName] = useState(currentUser?.displayName ?? '')
  const [tagline, setTagline] = useState(currentUser?.tagline ?? '')
  const [twitter, setTwitter] = useState(initialLinks.twitter)
  const [github, setGithub] = useState(initialLinks.github)
  const [website, setWebsite] = useState(initialLinks.website)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault()
    setProfileError(null)
    setProfileLoading(true)
    const { error } = await apiPut('/api/settings/profile', {
      displayName,
      tagline: tagline || undefined,
      socialLinks: {
        twitter: twitter || undefined,
        github: github || undefined,
        website: website || undefined,
      },
    })
    setProfileLoading(false)
    if (error) {
      setProfileError(error)
    } else {
      toast.success('Profile updated successfully.')
    }
  }

  // ── Username ─────────────────────────────────────────────────────────────
  const [username, setUsername] = useState(currentUser?.username ?? '')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [usernameLoading, setUsernameLoading] = useState(false)

  async function handleUsernameSubmit(e: React.FormEvent) {
    e.preventDefault()
    setUsernameError(null)
    setUsernameLoading(true)
    const { error } = await apiPut('/api/settings/username', { newUsername: username })
    setUsernameLoading(false)
    if (error) {
      setUsernameError(error)
    } else {
      toast.success('Username updated successfully.')
      await refreshCurrentUser()
    }
  }

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

      {/* Public Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Public Profile</CardTitle>
          <CardDescription>Update your display name, tagline, and social links</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tagline">Tagline</Label>
              <Input
                id="tagline"
                type="text"
                value={tagline ?? ''}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="A short bio or tagline"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="twitter">Twitter URL</Label>
              <Input
                id="twitter"
                type="url"
                value={twitter}
                onChange={(e) => setTwitter(e.target.value)}
                placeholder="https://twitter.com/yourhandle"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="github">GitHub URL</Label>
              <Input
                id="github"
                type="url"
                value={github}
                onChange={(e) => setGithub(e.target.value)}
                placeholder="https://github.com/yourhandle"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Website URL</Label>
              <Input
                id="website"
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://yourwebsite.com"
              />
            </div>
            {profileError && <p className="text-sm text-destructive">{profileError}</p>}
            <Button type="submit" disabled={profileLoading}>
              {profileLoading ? 'Saving…' : 'Save profile'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Username */}
      <Card>
        <CardHeader>
          <CardTitle>Username</CardTitle>
          <CardDescription>Change your public username</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUsernameSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
              />
              <p className="text-xs text-muted-foreground">
                3–10 characters, lowercase letters, numbers, _ and - only
              </p>
            </div>
            {usernameError && <p className="text-sm text-destructive">{usernameError}</p>}
            <Button type="submit" disabled={usernameLoading}>
              {usernameLoading ? 'Updating…' : 'Update username'}
            </Button>
          </form>
        </CardContent>
      </Card>

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
