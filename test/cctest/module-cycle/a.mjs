import {b} from './b.mjs';
export function a() { return 20; }
export let value = b() + a();
export function increment() { value++; }
