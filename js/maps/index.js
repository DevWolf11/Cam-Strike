import dust2 from './dust2.js';
import mirage from './mirage.js';
import cache from './cache.js';
import nuke from './nuke.js';

const builders = { dust2, mirage, cache, nuke };
export const MAP_LIST = [
  { id: 'dust2', name: 'Dust II', blurb: 'Long A, Catwalk, Tunnels' },
  { id: 'mirage', name: 'Mirage', blurb: 'Palace, Window, Apartments' },
  { id: 'cache', name: 'Cache', blurb: 'Quad, Garage, Checkers' },
  { id: 'nuke', name: 'Nuke', blurb: 'Two levels, Heaven, Ramp' },
];
const built = {};
export function getMap(id) { return (built[id] ||= builders[id]()); }
export const MAPS = new Proxy({}, {
  get: (_, k) => (builders[k] ? getMap(k) : undefined),
  ownKeys: () => Object.keys(builders),
  getOwnPropertyDescriptor: (_, k) => (builders[k] ? { enumerable: true, configurable: true, value: getMap(k) } : undefined),
});
