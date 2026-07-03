import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { ConfigProvider, Switch, theme } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'vk-chat-bot-theme';

type ThemeContextValue = {
  mode: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function readStoredTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') {
      return stored;
    }
  } catch {
    // ignore storage errors
  }

  return 'light';
}

export function applyTheme(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode;
}

export function saveTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore storage errors
  }
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }

  return context;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => readStoredTheme());

  const setTheme = useCallback((nextMode: ThemeMode) => {
    applyTheme(nextMode);
    saveTheme(nextMode);
    setMode(nextMode);
  }, []);

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  const value = useMemo(
    () => ({
      mode,
      setTheme,
    }),
    [mode, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider
        locale={ruRU}
        theme={{
          algorithm: mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
        }}
      >
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}

export function ThemeSwitcher() {
  const { mode, setTheme } = useTheme();

  return (
    <Switch
      checked={mode === 'dark'}
      checkedChildren={<MoonOutlined />}
      unCheckedChildren={<SunOutlined />}
      aria-label="Переключить тему"
      onChange={(checked) => setTheme(checked ? 'dark' : 'light')}
    />
  );
}
