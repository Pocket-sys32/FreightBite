import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  acceptLeg,
  arriveAtLegStop,
  fetchLegWorkflow,
  fetchLegs,
  finishLegHandoff,
  pauseLegRoute,
  resumeLegRoute,
  startLegRoute,
} from '../lib/api';
import { HANDOFF_COMPLETION_RADIUS_MILES } from '../lib/config';
import { computeHosUsage, legDriveState, nextLegAction } from '../lib/hos';
import { useAuth } from '../context/AuthContext';
import { useGpsTracker } from '../hooks/useGpsTracker';
import { colors } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { Leg, LegWorkflow } from '../lib/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function cardTone(status: string) {
  if (status === 'IN_TRANSIT') return styles.cardActive;
  if (status === 'COMPLETED') return styles.cardCompleted;
  return styles.card;
}

export function DriverDashboardScreen() {
  const navigation = useNavigation<Nav>();
  const { driver, setDriver } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openLegs, setOpenLegs] = useState<Leg[]>([]);
  const [myLegs, setMyLegs] = useState<Leg[]>([]);
  const [workflowByLeg, setWorkflowByLeg] = useState<Record<string, LegWorkflow>>({});
  const [selectedLegId, setSelectedLegId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [hosNowMs, setHosNowMs] = useState(() => Date.now());

  const { gpsError, gpsStatus, liveCoords } = useGpsTracker(driver, setDriver);

  const load = useCallback(async () => {
    if (!driver) return;
    setError(null);
    const [availableLegs, claimedLegs] = await Promise.all([
      fetchLegs({ status: 'OPEN' }),
      fetchLegs({ driverId: driver.id }),
    ]);

    const sortedClaimed = [...claimedLegs].sort((a, b) => a.sequence - b.sequence);
    const activeClaimed = sortedClaimed.filter((leg) => leg.status !== 'COMPLETED');

    const workflowEntries = await Promise.all(
      sortedClaimed.map(async (leg) => {
        try {
          const workflow = await fetchLegWorkflow(leg.id);
          return [leg.id, workflow] as const;
        } catch {
          return [leg.id, null] as const;
        }
      })
    );

    const nextWorkflowByLeg: Record<string, LegWorkflow> = {};
    for (const [legId, workflow] of workflowEntries) {
      if (workflow) nextWorkflowByLeg[legId] = workflow;
    }

    setOpenLegs(availableLegs);
    setMyLegs(activeClaimed);
    setWorkflowByLeg(nextWorkflowByLeg);
    setHosNowMs(Date.now());

    setSelectedLegId((previous) => {
      if (previous && activeClaimed.some((leg) => leg.id === previous)) return previous;
      const inTransit = activeClaimed.find((leg) => leg.status === 'IN_TRANSIT');
      return inTransit?.id || activeClaimed[0]?.id || null;
    });
  }, [driver]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load board');
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const allEvents = useMemo(
    () =>
      Object.values(workflowByLeg)
        .flatMap((workflow) => workflow.events || [])
        .filter((event) => event.driverId === driver?.id),
    [driver?.id, workflowByLeg]
  );

  const hos = useMemo(() => computeHosUsage(allEvents, hosNowMs), [allEvents, hosNowMs]);

  useEffect(() => {
    if (!hos.activelyDriving) return;
    const timer = setInterval(() => setHosNowMs(Date.now()), 15000);
    return () => clearInterval(timer);
  }, [hos.activelyDriving]);

  const shiftUsed = Math.min(11, hos.shiftHours);
  const cycleUsed = Math.min(70, hos.cycleHours);

  const selectedLeg = myLegs.find((leg) => leg.id === selectedLegId) || null;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  };

  const runAction = async (key: string, fn: () => Promise<void>, successNotice: string) => {
    setActionKey(key);
    setError(null);
    try {
      await fn();
      setNotice(successNotice);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed action');
    } finally {
      setActionKey(null);
    }
  };

  const handleLegAction = async (leg: Leg) => {
    const workflow = workflowByLeg[leg.id];
    const action = nextLegAction(workflow?.phase);
    if (!action) return;

    if (action === 'START_ROUTE') {
      await runAction(`START-${leg.id}`, () => startLegRoute(leg.id), `Started route for leg ${leg.sequence}.`);
      return;
    }

    if (action === 'ARRIVE') {
      await runAction(`ARRIVE-${leg.id}`, () => arriveAtLegStop(leg.id), `Marked arrival for leg ${leg.sequence}.`);
      return;
    }

    if (action === 'HANDOFF') {
      if (!liveCoords) {
        setError('Live GPS fix is required before finishing handoff.');
        return;
      }

      Alert.alert(
        'Finish Handoff',
        `Complete this handoff when you are inside ${HANDOFF_COMPLETION_RADIUS_MILES.toFixed(2)} mi of drop?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm',
            style: 'destructive',
            onPress: () => {
              void runAction(
                `HANDOFF-${leg.id}`,
                () => finishLegHandoff(leg.id, { lat: liveCoords.lat, lng: liveCoords.lng }),
                `Completed handoff for leg ${leg.sequence}.`
              );
            },
          },
        ]
      );
    }
  };

  const handlePauseToggle = async (leg: Leg) => {
    const workflow = workflowByLeg[leg.id];
    const state = legDriveState(workflow?.phase);
    if (state === 'IDLE') return;

    if (state === 'PAUSED') {
      await runAction(`RESUME-${leg.id}`, () => resumeLegRoute(leg.id), 'Drive resumed.');
    } else {
      await runAction(`PAUSE-${leg.id}`, () => pauseLegRoute(leg.id), 'Drive paused.');
    }
  };

  const visibleMapLegs = useMemo(() => {
    return myLegs.slice(0, 8);
  }, [myLegs]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      contentContainerStyle={styles.content}
    >
      <View style={styles.headerCard}>
        <Text style={styles.title}>{driver?.name || 'Driver'}</Text>
        <Text style={styles.subtle}>{driver?.currentCity || 'On Route'} • {driver?.trailerType} {driver?.trailerLength}</Text>
        <Text style={styles.hosText}>{shiftUsed.toFixed(1)} / 11 hrs driving</Text>
        <Text style={styles.subtle}>{cycleUsed.toFixed(1)} / 70 hrs cycle</Text>
        <Text style={styles.subtle}>Status: {hos.activelyDriving ? 'Driving' : 'Paused / Off Duty'}</Text>
      </View>

      <View style={styles.gpsCard}>
        <Text style={styles.sectionTitle}>Live GPS</Text>
        <Text style={styles.subtle}>GPS status: {gpsStatus}</Text>
        {gpsError ? <Text style={styles.errorText}>{gpsError}</Text> : null}
      </View>

      <View style={styles.mapWrap}>
        <Text style={styles.sectionTitle}>Live Route Map</Text>
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: liveCoords?.lat || driver?.currentLat || 39.5,
            longitude: liveCoords?.lng || driver?.currentLng || -98.35,
            latitudeDelta: 8,
            longitudeDelta: 8,
          }}
        >
          {liveCoords ? <Marker coordinate={{ latitude: liveCoords.lat, longitude: liveCoords.lng }} title="You" /> : null}
          {visibleMapLegs.map((leg) => {
            if (typeof leg.originLat !== 'number' || typeof leg.originLng !== 'number') return null;
            if (typeof leg.destinationLat !== 'number' || typeof leg.destinationLng !== 'number') return null;
            return (
              <React.Fragment key={leg.id}>
                <Marker coordinate={{ latitude: leg.originLat, longitude: leg.originLng }} title={`Leg ${leg.sequence} Pickup`} pinColor="#38bdf8" />
                <Marker coordinate={{ latitude: leg.destinationLat, longitude: leg.destinationLng }} title={`Leg ${leg.sequence} Drop`} pinColor="#f97316" />
                <Polyline
                  coordinates={[
                    { latitude: leg.originLat, longitude: leg.originLng },
                    { latitude: leg.destinationLat, longitude: leg.destinationLng },
                  ]}
                  strokeColor={selectedLegId === leg.id ? '#22c55e' : '#475569'}
                  strokeWidth={selectedLegId === leg.id ? 4 : 2}
                />
              </React.Fragment>
            );
          })}
        </MapView>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {notice ? <Text style={styles.noticeText}>{notice}</Text> : null}

      <Text style={styles.sectionTitle}>My Connected Legs</Text>
      {myLegs.map((leg) => {
        const workflow = workflowByLeg[leg.id];
        const action = nextLegAction(workflow?.phase);
        const driveState = legDriveState(workflow?.phase);

        return (
          <View key={leg.id} style={[styles.card, cardTone(leg.status), selectedLegId === leg.id ? styles.cardSelected : null]}>
            <TouchableOpacity onPress={() => setSelectedLegId(leg.id)}>
              <Text style={styles.cardTitle}>Leg {leg.sequence}: {leg.origin} → {leg.destination}</Text>
              <Text style={styles.subtle}>{leg.originAddress}</Text>
              <Text style={styles.subtle}>{leg.destinationAddress}</Text>
              <Text style={styles.subtle}>Phase: {workflow?.phase || 'OPEN'}</Text>
            </TouchableOpacity>
            <View style={styles.row}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => navigation.navigate('LegRoute', { legId: leg.id })}
              >
                <Text style={styles.actionText}>Get Directions</Text>
              </TouchableOpacity>

              {action ? (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionPrimary]}
                  disabled={actionKey === `${action}-${leg.id}`}
                  onPress={() => {
                    void handleLegAction(leg);
                  }}
                >
                  <Text style={styles.actionPrimaryText}>{action.replace('_', ' ')}</Text>
                </TouchableOpacity>
              ) : null}

              {driveState !== 'IDLE' ? (
                <TouchableOpacity
                  style={styles.actionBtn}
                  disabled={actionKey === `PAUSE-${leg.id}` || actionKey === `RESUME-${leg.id}`}
                  onPress={() => {
                    void handlePauseToggle(leg);
                  }}
                >
                  <Text style={styles.actionText}>{driveState === 'PAUSED' ? 'Resume Drive' : 'Pause Drive'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        );
      })}

      <Text style={styles.sectionTitle}>Open Legs</Text>
      {openLegs.map((leg) => (
        <View key={leg.id} style={styles.card}>
          <Text style={styles.cardTitle}>Leg {leg.sequence}: {leg.origin} → {leg.destination}</Text>
          <Text style={styles.subtle}>{leg.miles} mi • ${leg.ratePerMile.toFixed(2)}/mi</Text>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionPrimary, { marginTop: 8 }]}
            disabled={actionKey === `accept-${leg.id}`}
            onPress={() => {
              void runAction(`accept-${leg.id}`, () => acceptLeg(leg.id), `Accepted leg ${leg.sequence}.`);
            }}
          >
            <Text style={styles.actionPrimaryText}>Accept Leg</Text>
          </TouchableOpacity>
        </View>
      ))}

      {selectedLeg ? <View style={{ height: 10 }} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 14,
    gap: 12,
    paddingBottom: 28,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  headerCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  hosText: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: '700',
    marginTop: 4,
  },
  sectionTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  subtle: {
    color: colors.muted,
    fontSize: 13,
  },
  gpsCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  mapWrap: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  map: {
    height: 240,
    borderRadius: 10,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  cardActive: {
    borderColor: '#14532d',
  },
  cardCompleted: {
    borderColor: '#065f46',
    opacity: 0.85,
  },
  cardSelected: {
    borderColor: colors.primary,
  },
  cardTitle: {
    color: colors.text,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  actionBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#0b1220',
  },
  actionPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  actionText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 12,
  },
  actionPrimaryText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: 12,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
  },
  noticeText: {
    color: colors.primary,
    fontSize: 13,
  },
});
