import {a, value} from './a.mjs';
export function b() { return a() + 2; }
export function read() { return value; }
export let earlyRead;
try { read(); } catch (error) { earlyRead = error.name; }
