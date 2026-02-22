import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { updateDriverLiveLocation } from '../lib/api';
import type { Driver } from '../lib/types';

export function useGpsTracker(driver: Driver | null, onDriverSync: (driver: Driver) => void) {
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'watching' | 'blocked' | 'unsupported'>('idle');
  const [liveCoords, setLiveCoords] = useState<{ lat: number; lng: number } | null>(null);
  const lastSentAtRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!driver?.id) return;

    let mounted = true;
    let subscription: Location.LocationSubscription | null = null;

    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!mounted) return;
      if (permission.status !== 'granted') {
        setGpsStatus('blocked');
        setGpsError('Location access was denied.');
        return;
      }

      setGpsStatus('watching');
      setGpsError(null);

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 2000,
          distanceInterval: 5,
        },
        (position) => {
          if (!mounted) return;
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const accuracy = position.coords.accuracy;
          setLiveCoords({ lat, lng });

          const now = Date.now();
          if (inFlightRef.current) return;
          if (now - lastSentAtRef.current < 5000) return;

          inFlightRef.current = true;
          lastSentAtRef.current = now;
          updateDriverLiveLocation({ lat, lng, accuracy })
            .then((syncedDriver) => {
              if (!mounted) return;
              onDriverSync(syncedDriver);
            })
            .catch((error) => {
              if (!mounted) return;
              setGpsError(error instanceof Error ? error.message : 'Failed to sync GPS location');
            })
            .finally(() => {
              inFlightRef.current = false;
            });
        }
      );
    })().catch((error) => {
      if (!mounted) return;
      setGpsStatus('unsupported');
      setGpsError(error instanceof Error ? error.message : 'GPS is unavailable on this device.');
    });

    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, [driver?.id, onDriverSync]);

  return { gpsError, gpsStatus, liveCoords };
}
