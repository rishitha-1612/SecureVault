let cachedLocation = null
let pendingLocation = null

export function getBrowserLocation(timeout = 1500) {
  if (cachedLocation) {
    return Promise.resolve(cachedLocation)
  }

  if (pendingLocation) {
    return pendingLocation
  }

  pendingLocation = new Promise((resolve) => {
    if (!navigator.geolocation) {
      pendingLocation = null
      resolve({ location_permission: 'unsupported' })
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        cachedLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          location_accuracy: position.coords.accuracy,
          location_permission: 'granted',
        }
        pendingLocation = null
        resolve(cachedLocation)
      },
      (error) => {
        pendingLocation = null
        resolve({
          location_permission:
            error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable',
        })
      },
      {
        enableHighAccuracy: true,
        timeout,
        maximumAge: 60000,
      },
    )
  })

  return pendingLocation
}

export function primeBrowserLocation(timeout = 1500) {
  void getBrowserLocation(timeout)
}

export async function withBrowserLocation(payload, timeout = 1500) {
  const location = await getBrowserLocation(timeout)
  return { ...payload, ...location }
}
