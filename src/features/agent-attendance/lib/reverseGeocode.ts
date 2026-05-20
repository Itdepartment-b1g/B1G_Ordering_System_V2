/** Client-side reverse geocode (no API key; best-effort). */
export async function reverseGeocodeLabel(latitude: number, longitude: number): Promise<string | null> {
  try {
    const url = new URL('https://api.bigdatacloud.net/data/reverse-geocode-client');
    url.searchParams.set('latitude', String(latitude));
    url.searchParams.set('longitude', String(longitude));
    url.searchParams.set('localityLanguage', 'en');

    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = (await res.json()) as {
      city?: string;
      locality?: string;
      principalSubdivision?: string;
      countryName?: string;
    };

    const parts = [data.locality || data.city, data.principalSubdivision, data.countryName].filter(Boolean);
    const line = parts.join(', ');
    return line.length > 0 ? line : null;
  } catch {
    return null;
  }
}
