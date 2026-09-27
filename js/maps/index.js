import sirocco from './sirocco.js';
import medina from './medina.js';
import stockpile from './stockpile.js';
import reactor from './reactor.js';

const builders = { sirocco, medina, stockpile, reactor };
export const MAP_LIST = [
  { id: 'sirocco', name: 'Sirocco', blurb: 'Long A, Catwalk, Tunnels' },
  { id: 'medina', name: 'Medina', blurb: 'Palace, Window, Apartments' },
  { id: 'stockpile', name: 'Stockpile', blurb: 'Quad, Garage, Checkers' },
  { id: 'reactor', name: 'Reactor', blurb: 'Two levels, Heaven, Ramp room' },
];
const built = {};
export function getMap(id) { return (built[id] ||= (builders[id] || builders.sirocco)()); }
export const MAPS = new Proxy({}, {
  get: (_, k) => (builders[k] ? getMap(k) : undefined),
  ownKeys: () => Object.keys(builders),
  getOwnPropertyDescriptor: (_, k) => (builders[k] ? { enumerable: true, configurable: true, value: getMap(k) } : undefined),
});
