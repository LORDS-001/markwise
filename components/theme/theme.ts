export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "markwise-theme";
export const DEFAULT_THEME: ThemePreference = "light";
export const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function readThemePreference(storage?: Pick<Storage, "getItem">): ThemePreference {
  if (!storage) return DEFAULT_THEME;
  try {
    const value = storage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function writeThemePreference(
  preference: ThemePreference,
  storage?: Pick<Storage, "setItem">,
): void {
  if (!storage) return;
  try {
    storage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    return;
  }
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

export function getSystemPrefersDark(matchMedia?: Window["matchMedia"]): boolean {
  if (!matchMedia) return false;
  try {
    return matchMedia(DARK_MEDIA_QUERY).matches;
  } catch {
    return false;
  }
}

export function applyResolvedTheme(theme: ResolvedTheme, root?: HTMLElement): void {
  if (!root) return;
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
}

export const THEME_BOOTSTRAP_SCRIPT =
  '(function(){var d=document.documentElement,p="light";try{var s=localStorage.getItem("markwise-theme");if(s==="light"||s==="dark"||s==="system")p=s}catch(e){}var k=p==="dark";if(p==="system"){try{k=window.matchMedia("(prefers-color-scheme: dark)").matches}catch(e){k=false}}var t=k?"dark":"light";d.setAttribute("data-theme",t);d.style.colorScheme=t})()';
