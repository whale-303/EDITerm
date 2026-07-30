import { register } from '../../core/di/container.js';
import { TOKENS } from '../../core/di/tokens.js';

export interface ThemeColors {
  background: string;
  foreground: string;
  accent: string;
  border: string;
  selection: string;
  gutter: string;
  statusBar: string;
  statusBarForeground: string;
}

export interface Theme {
  name: string;
  colors: ThemeColors;
}

const DEFAULT_DARK: Theme = {
  name: 'EDITerm Dark',
  colors: {
    background: '#1e1e2e',
    foreground: '#cdd6f4',
    accent: '#89b4fa',
    border: '#45475a',
    selection: '#585b70',
    gutter: '#313244',
    statusBar: '#181825',
    statusBarForeground: '#cdd6f4',
  },
};

export interface IThemeService {
  readonly current: Theme;
  setTheme(theme: Theme): void;
  toAnsi(hex: string): string;
}

export class ThemeService implements IThemeService {
  current: Theme = DEFAULT_DARK;

  setTheme(theme: Theme): void {
    this.current = theme;
  }

  toAnsi(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `\x1b[38;2;${r};${g};${b}m`;
  }
}

register(TOKENS.ThemeService, () => new ThemeService());
