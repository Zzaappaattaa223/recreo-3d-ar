export const MAX_GPS_ACCURACY_METERS = 150;

export interface UserGeoPosition {
  lat: number;
  lon: number;
  accuracyMeters: number;
  timestampMs: number;
}

export interface GeoWatchOptions {
  onPosition: (pos: UserGeoPosition) => void;
  onError: (message: string) => void;
}

/**
 * Starts watching the user's GPS position strictly in local memory (never sent to backend).
 * Ignores readings worse than MAX_GPS_ACCURACY_METERS (50 m).
 */
export function watchLocalGeoPosition(options: GeoWatchOptions): () => void {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    options.onError("Geolocalización no disponible en este navegador.");
    return () => {};
  }

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const accuracy = pos.coords.accuracy;
      if (accuracy > MAX_GPS_ACCURACY_METERS) {
        return;
      }
      options.onPosition({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracyMeters: accuracy,
        timestampMs: pos.timestamp
      });
    },
    (err) => {
      options.onError(
        err.code === err.PERMISSION_DENIED
          ? "Permiso de ubicación GPS denegado."
          : "No se pudo obtener la ubicación GPS local."
      );
    },
    {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 10000
    }
  );

  return () => {
    navigator.geolocation.clearWatch(watchId);
  };
}
