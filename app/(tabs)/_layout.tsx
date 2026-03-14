import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';

export default function TabLayout() {
  // Always use the dark Matebil palette for the tab bar —
  // this app is a music tool, always used in dark context.
  const darkColors = Colors['dark'];

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: darkColors.tint,
        tabBarInactiveTintColor: darkColors.icon,
        tabBarStyle: {
          backgroundColor: darkColors.background,
          borderTopColor: '#2a5040',
          borderTopWidth: 1,
        },
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Tuner',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="tuningfork" color={color} />,
        }}
      />
      <Tabs.Screen
        name="scales"
        options={{
          title: 'Practice',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="music.note.list" color={color} />,
        }}
      />
      <Tabs.Screen
        name="metronome"
        options={{
          title: 'Metronome',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="metronome" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="gearshape.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
