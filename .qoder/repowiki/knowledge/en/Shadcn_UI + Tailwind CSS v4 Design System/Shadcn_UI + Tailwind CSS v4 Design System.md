---
kind: frontend_style
name: Shadcn/UI + Tailwind CSS v4 Design System
category: frontend_style
scope:
    - '**'
source_files:
    - components.json
    - src/react-app/index.css
    - src/react-app/main.tsx
    - src/react-app/lib/utils.ts
    - src/react-app/components/ui/button.tsx
    - src/react-app/components/ui/card.tsx
    - src/react-app/components/ThemeSwitcher.tsx
    - package.json
---

## Styling Architecture

The Zenith Creator Platform uses a **shadcn/ui**-based design system built on **Tailwind CSS v4** with the `@tailwindcss/vite` plugin. The styling approach combines utility-first CSS with a component library pattern, leveraging CSS custom properties (design tokens) for theming and consistency.

### Core Technology Stack

- **CSS Framework**: Tailwind CSS v4 (via `@tailwindcss/vite`)
- **Component Library**: shadcn/ui (radix-luma style preset)
- **Icon Library**: HugeIcons (`@hugeicons/react`) with Lucide React as fallback
- **Typography**: Variable fonts — Figtree (body), Inter, Playfair Display
- **Theme Management**: `next-themes` for light/dark/system mode switching
- **Animation Utilities**: `tw-animate-css` for pre-built animation classes
- **Class Composition**: `class-variance-authority` (CVA) + `clsx` + `tailwind-merge`

### Design Token System

Design tokens are defined as CSS custom properties in `src/react-app/index.css` using OKLCH color space for perceptual uniformity:

**Color Palette (zinc base)**:
- `--background`, `--foreground`: Page-level colors
- `--card`, `--card-foreground`: Surface containers
- `--primary`, `--primary-foreground`: Brand accent (blue hue ~252)
- `--secondary`, `--muted`: Supporting surfaces
- `--accent`, `--destructive`: State indicators
- `--sidebar-*`: Dedicated sidebar token set
- `--chart-{1-5}`: Data visualization palette

**Semantic Radius Scale**:
- `--radius-sm` through `--radius-4xl` derived from base `--radius: 0.5rem`

**Easing Functions**:
- `--ease-out`: `cubic-bezier(0.23, 1, 0.32, 1)` — primary motion
- `--ease-in-out`: `cubic-bezier(0.77, 0, 0.175, 1)` — balanced transitions
- `--ease-drawer`: `cubic-bezier(0.32, 0.72, 0, 1)` — overlay animations

### Theme Implementation

Dark mode is implemented via a `.dark` class selector on ancestor elements, toggled by `next-themes` with `attribute="class"`. The theme provider wraps the entire app in `main.tsx` with `defaultTheme="dark"` and `enableSystem` to respect OS preferences.

All color tokens have explicit light and dark variants using OKLCH values, ensuring consistent contrast ratios across modes.

### Component Pattern

UI components follow the shadcn convention:

1. **Variant Definition**: Use `cva()` from `class-variance-authority` to define variant maps (e.g., `buttonVariants` with `variant` and `size` props)
2. **Class Merging**: Use the `cn()` utility (`tailwind-merge` + `clsx`) to safely compose classes without conflicts
3. **Data Attributes**: Components expose `data-slot` and `data-variant`/`data-size` attributes for CSS targeting and testing
4. **Slot Composition**: Use Radix UI's `Slot.Root` for `asChild` polymorphism

Example from `button.tsx`:
```tsx
const buttonVariants = cva("inline-flex ...", {
  variants: { variant: { default: "...", outline: "..." }, size: { ... } }
})
```

### Responsive Strategy

Breakpoints follow Tailwind defaults (`sm:640px`, `md:768px`, `lg:1024px`, `xl:1280px`). Common patterns:

- **Sidebar layout**: Hidden on mobile, visible at `lg:` breakpoint
- **Grid layouts**: Single column on mobile, multi-column at `sm:` or `lg:`
- **Padding scaling**: `p-4 sm:p-6 lg:px-8` for progressive spacing
- **Flex direction**: `flex-col sm:flex-row` for stacking vs. horizontal layouts

### Motion & Accessibility

Custom keyframe animations are defined for auth pages (`auth-grid-pan`, `auth-fade-up`, `auth-float`, `auth-path-draw`, `caret-blink`). Utility classes like `.interactive-surface` provide consistent hover/active transitions.

**Reduced motion support**: A `@media (prefers-reduced-motion: reduce)` block disables all animations and transitions for accessibility compliance.

### File Structure

```
src/react-app/
├── index.css          # Global styles, design tokens, theme definitions
├── components/ui/     # shadcn primitive components (button, card, input, etc.)
├── components/        # Application-specific composite components
├── lib/utils.ts       # cn() class merging utility
└── main.tsx           # ThemeProvider root configuration
```

### Developer Conventions

1. **Always use `cn()`** for composing conditional classes — never concatenate strings directly
2. **Define variants with CVA** when a component has multiple visual states
3. **Use semantic color tokens** (`bg-card`, `text-muted-foreground`) instead of raw color values
4. **Apply `data-slot` attributes** for internal component composition targeting
5. **Respect `prefers-reduced-motion`** — avoid adding animations without reduced-motion fallbacks
6. **Use OKLCH colors** in custom CSS for better perceptual consistency than HSL/RGB
7. **Leverage HugeIcons** via `data-icon` attribute for consistent icon sizing in buttons
