import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { API_ORIGIN, GOOGLE_MAPS_API_KEY } from '../lib/config';
import { colors } from '../theme';

export function AccountScreen() {
  const { driver, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Account</Text>
        <Text style={styles.label}>Driver</Text>
        <Text style={styles.value}>{driver?.name}</Text>
        <Text style={styles.label}>UUID</Text>
        <Text style={styles.mono}>{driver?.id}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Config</Text>
        <Text style={styles.label}>API Origin</Text>
        <Text style={styles.mono}>{API_ORIGIN || 'Missing EXPO_PUBLIC_API_ORIGIN'}</Text>
        <Text style={styles.label}>Google Maps Key</Text>
        <Text style={styles.value}>{GOOGLE_MAPS_API_KEY ? 'Configured' : 'Missing'}</Text>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={() => void signOut()}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 14,
    gap: 12,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  label: {
    color: colors.muted,
    fontSize: 12,
  },
  value: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  mono: {
    color: colors.text,
    fontSize: 12,
    fontFamily: 'Courier',
  },
  logoutBtn: {
    marginTop: 8,
    backgroundColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  logoutText: {
    color: colors.text,
    fontWeight: '700',
  },
});
