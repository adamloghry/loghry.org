// Reminders for the tables that go stale. Prints warnings; never fails the build (the site stays correct, only less current).
// Run: npm run check:upkeep
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/sky/model.ts', import.meta.url), 'utf8');
const reviewed = Number(/CALENDAR_REVIEWED = (\d{4})/.exec(src)?.[1]);
const lighting = Number(/LIGHTING_REVIEWED = (\d{4})/.exec(src)?.[1]);
const schedules = Number(/SCHEDULES_REVIEWED = (\d{4})/.exec(src)?.[1]);
const normalsEnd = Number(/NORMALS_PERIOD = '\d{4}.(\d{4})'/.exec(src)?.[1]);
const year = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric' }).format(new Date()));
const notes = [];
if (!reviewed || !normalsEnd) notes.push('could not read CALENDAR_REVIEWED / NORMALS_PERIOD from src/sky/model.ts');
if (lighting && year > lighting) notes.push(`skyline lighting dates (Seahawks home games, Pride weekend) were last set for ${lighting}; add ${year}'s and set LIGHTING_REVIEWED = ${year}.`);
if (!schedules) notes.push('could not read SCHEDULES_REVIEWED from src/sky/model.ts');
if (schedules && year > schedules) notes.push(`ferry, seaplane and arrival patterns were last checked for ${schedules}; it is ${year}. Compare FERRY_ROUTES, seaplaneAt and ARRIVALS with the services, then set SCHEDULES_REVIEWED = ${year}.`);
if (reviewed && year > reviewed) notes.push(`calendar events were last checked for ${reviewed}; it is ${year}. Check the fireworks times and the Duck Dodge season in sky.calendar, then set CALENDAR_REVIEWED = ${year}.`);
if (normalsEnd && year >= normalsEnd + 11) notes.push(`weather normals cover a period ending ${normalsEnd}; NOAA publishes a new 30-year set each decade. Replace NORMALS and NORMALS_PERIOD.`);
if (notes.length) for (const n of notes) console.warn('upkeep: ' + n); else console.log(`upkeep: nothing due (calendar checked ${reviewed}, normals to ${normalsEnd})`);
