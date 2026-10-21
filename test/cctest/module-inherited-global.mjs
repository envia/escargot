inheritedSetter = 42;
inheritedData = 43;
const errors = [];
try { absentGlobalBinding = 1; } catch (e) { errors.push(e.name); }
try { inheritedReadOnly = 2; } catch (e) { errors.push(e.name); }
try { inheritedGetterOnly = 2; } catch (e) { errors.push(e.name); }
globalThis.inheritedBindingsPassed = setterValue === 42 && inheritedData === 43 &&
    Object.hasOwn(globalThis, 'inheritedData') &&
    errors.join() === 'ReferenceError,TypeError,TypeError';
