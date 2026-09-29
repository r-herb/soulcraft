// Real-city areas. bbox is [south, west, north, east] in degrees; spawn is
// where a new world starts ([lat, lon]).
export const CITIES = {
  malaga: {
    name: 'Malaga',
    // the whole city inside the ring road: from the airport and the
    // Guadalhorce in the west, under the Hiperronda (A-7) in the north, to El
    // Palo in the east, and the sea in the south
    bbox: [36.6600, -4.5150, 36.7580, -4.3400],
    // the first Malaga (Centro to El Limonar): its projection is kept so that
    // worlds made with it keep their places (x = 0, z = 0 at its north-west)
    proj: { west: -4.4290, north: 36.7320, lat0: 36.72125 },
    osmTiles: [8, 6], // Overpass queries (x, y); each part is saved on its own
    spawn: [36.72108, -4.42195], // Plaza de la Constitucion
    // city buses (EMT Malaga) from the city's open data portal
    gtfs: {
      ckan: 'https://datosabiertos.malaga.eu',
      urls: ['https://datosabiertos.malaga.eu/recursos/transporte/EMT/lineasYHorarios/google_transit.zip'],
      search: ['gtfs EMT', 'google transit', 'EMT lineas horarios'],
    },
  },
};
