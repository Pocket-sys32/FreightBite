import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import polyline from '@mapbox/polyline';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fetchLegs } from '../lib/api';
import { GOOGLE_MAPS_API_KEY } from '../lib/config';
import { useAuth } from '../context/AuthContext';
import { useGpsTracker } from '../hooks/useGpsTracker';
import { colors } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { Leg } from '../lib/types';

type Props = NativeStackScreenProps<RootStackParamList, 'LegRoute'>;

type DirectionSegment = {
  id: 'to-pickup' | 'pickup-to-drop';
  title: string;
  color: string;
  points: Array<{ latitude: number; longitude: number }>;
  distanceMiles: number;
  durationMinutes: number;
};

async function fetchDirections(origin: string, destination: string): Promise<DirectionSegment['points'] & any> {
  const params = new URLSearchParams({
    origin,
    destination,
    mode: 'driving',
    key: GOOGLE_MAPS_API_KEY,
  });

  const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`);
  if (!response.ok) throw new Error(`Directions failed (${response.status})`);
  const json = await response.json();
  if (json.status !== 'OK') throw new Error(json.error_message || json.status || 'No route');

  const route = json.routes?.[0];
  const routeLeg = route?.legs?.[0];
  const encoded = route?.overview_polyline?.points || '';
  const decoded = polyline.decode(encoded).map(([lat, lng]) => ({ latitude: lat, longitude: lng }));

  return {
    points: decoded,
    distanceMiles: Number(((routeLeg?.distance?.value || 0) * 0.000621371).toFixed(2)),
    durationMinutes: Number(((routeLeg?.duration?.value || 0) / 60).toFixed(1)),
    steps: (routeLeg?.steps || []).slice(0, 10).map((step: any) => ({
      instruction: String(step.html_instructions || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
      distanceMiles: Number(((step.distance?.value || 0) * 0.000621371).toFixed(2)),
      durationMinutes: Number(((step.duration?.value || 0) / 60).toFixed(1)),
    })),
  };
}

export function LegRouteScreen({ route }: Props) {
  const { legId } = route.params;
  const { driver, setDriver } = useAuth();
  const { liveCoords } = useGpsTracker(driver, setDriver);
  const [loading, setLoading] = useState(true);
  const [leg, setLeg] = useState<Leg | null>(null);
  const [segments, setSegments] = useState<DirectionSegment[]>([]);
  const [steps, setSteps] = useState<Array<{ section: string; instruction: string; distanceMiles: number; durationMinutes: number }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!driver) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [driverLegs, openLegs] = await Promise.all([
          fetchLegs({ driverId: driver.id }),
          fetchLegs({ status: 'OPEN' }),
        ]);
        const selectedLeg = driverLegs.find((item) => item.id === legId) || openLegs.find((item) => item.id === legId) || null;
        setLeg(selectedLeg);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load route leg');
      } finally {
        setLoading(false);
      }
    })();
  }, [driver?.id, legId]);

  useEffect(() => {
    if (!leg || !liveCoords || !GOOGLE_MAPS_API_KEY) return;

    (async () => {
      setError(null);
      try {
        const origin = `${liveCoords.lat},${liveCoords.lng}`;
        const pickup = leg.originAddress || `${leg.origin}, ${leg.originState}`;
        const destination = leg.destinationAddress || `${leg.destination}, ${leg.destinationState}`;

        const [toPickup, pickupToDrop] = await Promise.all([
          fetchDirections(origin, pickup),
          fetchDirections(pickup, destination),
        ]);

        setSegments([
          {
            id: 'to-pickup',
            title: 'Drive to Pickup / Transfer',
            color: '#2563EB',
            points: toPickup.points,
            distanceMiles: toPickup.distanceMiles,
            durationMinutes: toPickup.durationMinutes,
          },
          {
            id: 'pickup-to-drop',
            title: 'Pickup / Transfer to Drop',
            color: '#F97316',
            points: pickupToDrop.points,
            distanceMiles: pickupToDrop.distanceMiles,
            durationMinutes: pickupToDrop.durationMinutes,
          },
        ]);

        setSteps([
          ...toPickup.steps.map((step: any) => ({ section: 'To Pickup', ...step })),
          ...pickupToDrop.steps.map((step: any) => ({ section: 'To Drop', ...step })),
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load directions');
      }
    })();
  }, [leg?.id, liveCoords?.lat, liveCoords?.lng]);

  const initialRegion = useMemo(
    () => ({
      latitude: liveCoords?.lat || leg?.originLat || 39.5,
      longitude: liveCoords?.lng || leg?.originLng || -98.35,
      latitudeDelta: 0.4,
      longitudeDelta: 0.4,
    }),
    [leg?.originLat, leg?.originLng, liveCoords?.lat, liveCoords?.lng]
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!leg) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>Leg not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Leg {leg.sequence} Directions</Text>
      <Text style={styles.subtle}>{leg.origin} → {leg.destination}</Text>

      <View style={styles.mapCard}>
        <MapView style={styles.map} initialRegion={initialRegion}>
          {liveCoords ? <Marker coordinate={{ latitude: liveCoords.lat, longitude: liveCoords.lng }} title="You" /> : null}
          {segments[0]?.points?.length ? <Marker coordinate={segments[0].points[segments[0].points.length - 1]} title="Pickup" pinColor="#2563EB" /> : null}
          {segments[1]?.points?.length ? <Marker coordinate={segments[1].points[segments[1].points.length - 1]} title="Drop" pinColor="#F97316" /> : null}
          {segments.map((segment) => (
            <Polyline key={segment.id} coordinates={segment.points} strokeColor={segment.color} strokeWidth={5} />
          ))}
        </MapView>
      </View>

      {segments.map((segment) => (
        <View key={segment.id} style={styles.segmentCard}>
          <Text style={styles.segmentTitle}>{segment.title}</Text>
          <Text style={styles.subtle}>{segment.distanceMiles.toFixed(1)} mi • {segment.durationMinutes.toFixed(0)} min</Text>
        </View>
      ))}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.section}>Turn-by-Turn</Text>
      {steps.map((step, index) => (
        <View key={`${step.section}-${index}`} style={styles.stepRow}>
          <Text style={styles.stepSection}>{step.section}</Text>
          <Text style={styles.stepText}>{step.instruction}</Text>
          <Text style={styles.subtle}>{step.distanceMiles.toFixed(1)} mi • {step.durationMinutes.toFixed(0)} min</Text>
        </View>
      ))}

      {!GOOGLE_MAPS_API_KEY ? <Text style={styles.error}>Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in mobile-app/.env.</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, gap: 10, paddingBottom: 24 },
  centered: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  subtle: { color: colors.muted, fontSize: 12 },
  mapCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  map: { height: 380 },
  section: { color: colors.text, fontWeight: '700', fontSize: 16, marginTop: 8 },
  segmentCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 2,
  },
  segmentTitle: { color: colors.text, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 12 },
  stepRow: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 4,
  },
  stepSection: { color: colors.info, fontSize: 11, fontWeight: '700' },
  stepText: { color: colors.text, fontSize: 13 },
});
