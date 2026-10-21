import {a, value, increment} from './a.mjs';
import {read, earlyRead} from './b.mjs';
if (a() !== 20 || value !== 42 || read() !== 42 || earlyRead !== 'ReferenceError')
    throw new Error('cyclic imports or temporal dead zone failed');
increment();
if (read() !== 43) throw new Error('import binding is not live');
globalThis.moduleCyclePassed = true;
