/**
 * lib/themes — 首页 UI 模板体系（≥10 套 · cookie 驱动 SSR 生效）
 *
 * 设计：全部主题只是 :root CSS 变量的覆盖集 —— 结构零改动、组件零感知。
 * 骨架期约定：cookie `solfit_theme` 持久化访客选择（Phase 2 商家后台可设
 * 站点默认主题：store("settings") 落 defaultTheme，访客 cookie 优先）。
 *
 * 暗色主题（noir/midnight）需覆盖全量文字/表面变量（btn-primary 用 --ink
 * 反转、announce/footer 背景用 --ink —— 自动适配，无需额外规则）。
 */

export const DEFAULT_THEME = "solfit";

/** 10 套主题（id 必须稳定 —— cookie 持久化的键） */
export const THEMES = [
  {
    id: "solfit", label: "暖木 Solfit", dark: false, swatch: "#2F5D46",
    vars: {}, // 原版（globals.css 默认）—— 无覆盖
  },
  {
    id: "noir", label: "黑金 Noir", dark: true, swatch: "#C9A227",
    vars: {
      "--ink": "#E9E2D4", "--bg": "#17140F", "--surface": "#211D16", "--border": "#3A342A",
      "--text-sub": "#9C9284", "--accent": "#C9A227", "--fit": "#C9A227", "--fit-soft": "#2E2A1E",
      "--fit-text": "#E5C84F", "--font-display": "Georgia, serif",
    },
  },
  {
    id: "blush", label: "玫瑰 Blush", dark: false, swatch: "#C25E7A",
    vars: {
      "--ink": "#2B2024", "--bg": "#FAF0F2", "--surface": "#fff", "--border": "#EDD9DE",
      "--text-sub": "#8A737B", "--accent": "#C25E7A", "--fit": "#A64D68", "--fit-soft": "#F7E3E9",
      "--fit-text": "#8C3E54", "--font-display": "Georgia, serif",
    },
  },
  {
    id: "azure", label: "湛蓝 Azure", dark: false, swatch: "#1F4E79",
    vars: {
      "--ink": "#152430", "--bg": "#EFF4FA", "--surface": "#fff", "--border": "#D5E1EE",
      "--text-sub": "#5C7284", "--accent": "#2E6FA3", "--fit": "#1F4E79", "--fit-soft": "#DCE9F5",
      "--fit-text": "#173D5F", "--font-display": "'Palatino Linotype', Georgia, serif",
    },
  },
  {
    id: "terracotta", label: "陶土 Terra", dark: false, swatch: "#C96F4A",
    vars: {
      "--ink": "#2E211A", "--bg": "#F9F1E9", "--surface": "#fff", "--border": "#EAD9C9",
      "--text-sub": "#826B5B", "--accent": "#C96F4A", "--fit": "#8A4A2E", "--fit-soft": "#F4E4D8",
      "--fit-text": "#6E3A22", "--font-display": "Georgia, serif",
    },
  },
  {
    id: "forest", label: "苔原 Forest", dark: false, swatch: "#3A5F44",
    vars: {
      "--ink": "#182420", "--bg": "#F0F4F0", "--surface": "#fff", "--border": "#D8E2D8",
      "--text-sub": "#5F7264", "--accent": "#4E7A5A", "--fit": "#3A5F44", "--fit-soft": "#E2EEE6",
      "--fit-text": "#2C4B35", "--font-display": "Georgia, serif",
    },
  },
  {
    id: "minimal", label: "极简 Mono", dark: false, swatch: "#111111",
    vars: {
      "--ink": "#111111", "--bg": "#FFFFFF", "--surface": "#FFFFFF", "--border": "#E4E4E4",
      "--text-sub": "#7A7A7A", "--accent": "#111111", "--fit": "#3D4A42", "--fit-soft": "#EFF2F0",
      "--fit-text": "#2C3630", "--font-display": "'Helvetica Neue', 'Segoe UI', sans-serif",
      "--r-lg": "4px", "--r-md": "2px", "--r-pill": "999px", "--sh-md": "0 6px 18px rgba(17,17,17,0.08)",
    },
  },
  {
    id: "editorial", label: "杂志 Editorial", dark: false, swatch: "#B3352C",
    vars: {
      "--ink": "#141210", "--bg": "#F5F1E8", "--surface": "#FBF9F2", "--border": "#DDD3C2",
      "--text-sub": "#6E6455", "--accent": "#B3352C", "--fit": "#1F1C18", "--fit-soft": "#EAE4D6",
      "--fit-text": "#000000", "--font-display": "'Times New Roman', Georgia, serif",
      "--r-lg": "0px", "--r-md": "0px", "--sh-md": "6px 6px 0 rgba(20,18,16,0.12)",
    },
  },
  {
    id: "midnight", label: "午夜 Midnight", dark: true, swatch: "#8B7BD8",
    vars: {
      "--ink": "#E8EAF2", "--bg": "#141726", "--surface": "#1E2235", "--border": "#323A54",
      "--text-sub": "#8C93AC", "--accent": "#8B7BD8", "--fit": "#5E8AA8", "--fit-soft": "#252B42",
      "--fit-text": "#8FB6D0", "--font-display": "Georgia, serif",
    },
  },
  {
    id: "sakura", label: "樱花 Sakura", dark: false, swatch: "#D49BB8",
    vars: {
      "--ink": "#332630", "--bg": "#FBF7F4", "--surface": "#fff", "--border": "#EDE0E8",
      "--text-sub": "#8A7484", "--accent": "#D49BB8", "--fit": "#6E8B7E", "--fit-soft": "#E9F0EC",
      "--fit-text": "#526E60", "--font-display": "Georgia, serif",
    },
  },
];

const byId = new Map(THEMES.map((t) => [t.id, t]));

/** 由 cookie 取主题（非法值回落默认 —— cookie 是不可信输入） */
export function getThemeFromCookies(jar) {
  const id = jar.get("solfit_theme")?.value;
  return byId.get(id) || byId.get(DEFAULT_THEME);
}

/** 主题 → :root 覆盖 CSS（默认主题返回空串 = 零成本） */
export function themeCss(theme) {
  if (!theme || !Object.keys(theme.vars).length) return "";
  const body = Object.entries(theme.vars).map(([k, v]) => `${k}:${v};`).join("");
  return `:root{${body}}`;
}
