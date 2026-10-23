// Палитры тем. Все текстовые цвета (text, muted, accent, ok/err/warn, синтаксис)
// дают контраст ≥ 7:1 на bg, surface и raised — важно для демонстрации экрана.

export type Palette = {
  bg: string; surface: string; raised: string; line: string
  text: string; muted: string; accent: string; onAccent: string
  ok: string; err: string; warn: string
  kw: string; str: string; num: string; com: string; fn: string; def: string; prop: string
  dark: boolean
}

export const THEMES = {
  dark: {
    label: 'Dark',
    p: {
      bg: '#121418', surface: '#17191f', raised: '#1f2229', line: '#2a2e37',
      text: '#eceef2', muted: '#bcc2ce', accent: '#b3a8ff', onAccent: '#14112b',
      ok: '#5ee0a6', err: '#ff9a9a', warn: '#f2c86b',
      kw: '#c9b8ff', str: '#9fe3b4', num: '#f7c97e', com: '#aab3c2', fn: '#8fd0ff', def: '#ffd6a3', prop: '#d6dbe4',
      dark: true,
    },
  },
  light: {
    label: 'Light',
    p: {
      bg: '#ffffff', surface: '#f6f7f9', raised: '#eceef2', line: '#e1e4ea',
      text: '#15171c', muted: '#3c424e', accent: '#4430b8', onAccent: '#ffffff',
      ok: '#0a5a32', err: '#921620', warn: '#6e4700',
      kw: '#5a2fb0', str: '#135426', num: '#7a3400', com: '#434956', fn: '#0b4f8a', def: '#7a2e5c', prop: '#262a33',
      dark: false,
    },
  },
  midnight: {
    label: 'Midnight',
    p: {
      bg: '#0c1322', surface: '#101a2c', raised: '#172338', line: '#21304b',
      text: '#e8eef8', muted: '#b6c3da', accent: '#93bcff', onAccent: '#0a1530',
      ok: '#6fe0b2', err: '#ff9f9f', warn: '#ffd479',
      kw: '#b8b0ff', str: '#9fe3c0', num: '#ffcf8a', com: '#a8b6cf', fn: '#8fd4ff', def: '#ffd6a8', prop: '#d3dcec',
      dark: true,
    },
  },
  warm: {
    label: 'Warm',
    p: {
      bg: '#f8f3e9', surface: '#f1eadc', raised: '#ebe3d2', line: '#ddd2bd',
      text: '#251d14', muted: '#4a3f31', accent: '#7a2d0c', onAccent: '#fffaf2',
      ok: '#1f4a1a', err: '#7e1913', warn: '#5e4200',
      kw: '#5c2880', str: '#264a14', num: '#742f00', com: '#4a4134', fn: '#193f63', def: '#6d2434', prop: '#33291d',
      dark: false,
    },
  },
} satisfies Record<string, { label: string; p: Palette }>

export type ThemeId = keyof typeof THEMES

export const CODE_FONTS = {
  jetbrains: { label: 'JetBrains Mono', family: '"JetBrains Mono"' },
  plex: { label: 'IBM Plex Mono', family: '"IBM Plex Mono"' },
  fira: { label: 'Fira Mono', family: '"Fira Mono"' },
} as const
export type CodeFontId = keyof typeof CODE_FONTS

/** Полупрозрачный вариант цвета (#rrggbb + альфа 0..1). */
export const alpha = (hex: string, a: number) => hex + Math.round(a * 255).toString(16).padStart(2, '0')

export function applyTheme(id: ThemeId, font: CodeFontId) {
  const p: Palette = (THEMES[id] ?? THEMES.dark).p
  const r = document.documentElement
  const vars: Record<string, string> = {
    bg: p.bg, surface: p.surface, raised: p.raised, line: p.line,
    text: p.text, muted: p.muted, accent: p.accent, 'on-accent': p.onAccent,
    ok: p.ok, err: p.err, warn: p.warn,
    'accent-soft': alpha(p.accent, p.dark ? 0.14 : 0.1),
    'ok-soft': alpha(p.ok, p.dark ? 0.13 : 0.1),
    'err-soft': alpha(p.err, p.dark ? 0.13 : 0.08),
    'warn-soft': alpha(p.warn, p.dark ? 0.13 : 0.1),
    sel: alpha(p.accent, p.dark ? 0.3 : 0.22),
    'active-line': alpha(p.text, p.dark ? 0.05 : 0.045),
    hover: alpha(p.text, p.dark ? 0.06 : 0.05),
    shadow: p.dark ? '0 1px 2px rgba(0,0,0,.4), 0 4px 16px rgba(0,0,0,.25)' : '0 1px 2px rgba(20,20,40,.06), 0 4px 16px rgba(20,20,40,.06)',
    'syn-kw': p.kw, 'syn-str': p.str, 'syn-num': p.num, 'syn-com': p.com, 'syn-fn': p.fn, 'syn-def': p.def, 'syn-prop': p.prop,
    'font-code': `${(CODE_FONTS[font] ?? CODE_FONTS.jetbrains).family}, ui-monospace, monospace, 'Segoe UI Emoji', 'Noto Color Emoji'`,
  }
  for (const [k, v] of Object.entries(vars)) r.style.setProperty('--' + k, v)
  r.style.colorScheme = p.dark ? 'dark' : 'light'
  r.dataset.theme = id
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.surface)
}

export const palette = (id: ThemeId): Palette => (THEMES[id] ?? THEMES.dark).p
