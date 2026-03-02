import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { logger } from '../utils/logger';

interface Settings {
  referencePitch: number;
  yinThreshold: number;
  theme: 'dark' | 'light' | 'classic';
}

interface SettingsContextType {
  settings: Settings;
  updateReferencePitch: (pitch: number) => void;
  updateYinThreshold: (threshold: number) => void;
  updateTheme: (theme: 'dark' | 'light' | 'classic') => void;
  getThemeColors: () => ThemeColors;
}

interface ThemeColors {
  background: string;
  primary: string;
  primaryBorder: string;
  secondary: string;
  text: string;
  textSecondary: string;
  textOnPrimary: string;
  buttonBg: string;
  buttonBorder: string;
  flat: string;
  flatBorder: string;
  sharp: string;
  sharpBorder: string;
  inTune: string;
  inTuneBorder: string;
}

const defaultSettings: Settings = {
  referencePitch: 440,
  yinThreshold: 0.15,
  theme: 'dark',
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem('appSettings');
      if (stored) {
        const parsed = JSON.parse(stored);
        setSettings(parsed);
      }
    } catch (error) {
      // Malformed storage data — fall back to defaults silently
      logger.error('Error loading settings:', error);
    }
  };

  const saveSettings = async (newSettings: Settings) => {
    try {
      await AsyncStorage.setItem('appSettings', JSON.stringify(newSettings));
      setSettings(newSettings);
    } catch (error) {
      logger.error('Error saving settings:', error);
    }
  };

  const updateReferencePitch = (pitch: number) => {
    saveSettings({ ...settings, referencePitch: pitch });
  };

  const updateYinThreshold = (threshold: number) => {
    saveSettings({ ...settings, yinThreshold: threshold });
  };

  const updateTheme = (theme: 'dark' | 'light' | 'classic') => {
    saveSettings({ ...settings, theme });
  };

  const getThemeColors = (): ThemeColors => {
    switch (settings.theme) {
      case 'light':
        return {
          background: '#f0f0f0',
          primary: '#0066ff',
          primaryBorder: '#0088ff',
          secondary: '#333',
          text: '#000',
          textSecondary: '#666',
          textOnPrimary: '#fff',
          buttonBg: '#e0e0e0',
          buttonBorder: '#ccc',
          flat: '#ff6600',
          flatBorder: '#ff8800',
          sharp: '#cc0066',
          sharpBorder: '#ff0088',
          inTune: '#00aa00',
          inTuneBorder: '#00cc00',
        };
      case 'classic':
        return {
          background: '#1a1a0a',
          primary: '#ffaa00',
          primaryBorder: '#ffcc00',
          secondary: '#664400',
          text: '#ffcc66',
          textSecondary: '#996633',
          textOnPrimary: '#000',
          buttonBg: '#332200',
          buttonBorder: '#553300',
          flat: '#ff6600',
          flatBorder: '#ff8800',
          sharp: '#cc3300',
          sharpBorder: '#ff4400',
          inTune: '#ffaa00',
          inTuneBorder: '#ffcc00',
        };
      case 'dark':
      default:
        return {
          background: '#0F1F15',   // Matebil surface-dark
          primary: '#2ECC71',      // Matebil accent
          primaryBorder: '#1E6B35',
          secondary: '#1a3322',
          text: '#F2FAF5',         // Matebil surface-dark-foreground
          textSecondary: '#7aaa8a',
          textOnPrimary: '#0F1F15',
          buttonBg: '#162a1e',
          buttonBorder: '#2a5040',
          flat: '#F5A623',         // Matebil amber
          flatBorder: '#d4891e',
          sharp: '#e05080',
          sharpBorder: '#c0305a',
          inTune: '#2ECC71',
          inTuneBorder: '#1E6B35',
        };
    }
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateReferencePitch,
        updateYinThreshold,
        updateTheme,
        getThemeColors,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
};
