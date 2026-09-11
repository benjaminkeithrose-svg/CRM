# `app.js` hooks

Seven touches. Five are guarded one-liners. Two are the priority sort, which
you approved as preference 2 and which cannot be done from `healthlib.js`
because `SEV_ORDER` lives in `app.js` and loads after it.

Every one is additive. With `healthlib.js` absent, or with `priority` missing
from an entry, behaviour is exactly what it is today.

---

## 1. Priority comparator — insert after line 5557

Directly below the existing `bySeverity`.

```js
/* Priority is the maintenance work order; severity is the condition found.
   They usually agree. Where they don't the work order wins, because that is
   the list the maintenance team acts from. Findings with no priority - every
   entry logged before the fault library existed - keep their severity order
   among themselves and sit below anything prioritised. */
const PRI_ORDER = {Critical:0, High:1, Medium:2, Low:3};
const byWorkOrder = (a,b) => {
  const pa = PRI_ORDER[a.priority], pb = PRI_ORDER[b.priority];
  if (pa !== undefined || pb !== undefined) return (pa ?? 9) - (pb ?? 9);
  return bySeverity(a,b);
};
```

## 2. `callSummary()` — line 2337

```js
    health: E('health').slice().sort(byWorkOrder).map(e => ({
      asset:e.asset, fault:e.fault, htype:e.htype, severity:e.severity,
      priority:e.priority, owner:e.owner, due:e.due, action:e.action
    })),
```

Two changes: the sort, and `priority` / `owner` / `due` added to the mapped
object. Without the second change priority never reaches the invite body —
`notesText()` and `notesHtml()` both read from here, so they inherit the new
order and the new fields for free.

## 3. `buildNotesHTML()` — line 5688

```js
  const health = c.entries.filter(e=>e.type==='health').slice().sort(byWorkOrder);
```

## 4. Fault picker on the health form

Wherever `hType` is rendered, add a button beside it:

```js
if (window.HealthLib) {
  HealthLib.openPicker({asset: v('hAsset')}, e => {
    $('hType').value   = e.htype;
    $('hFault').value  = e.fault;
    $('hAction').value = e.action;
    pickSeverity(e.severity);        // existing hSev segmented control
    healthExtra = e;                 // stash for the save step
  });
}
```

`healthExtra` is a module-scope variable holding the fields the library adds.

## 5. Health save — merge the extra fields

Where the `type:'health'` entry is assembled:

```js
const entry = Object.assign({}, healthExtra || {}, {
  type:'health', asset:a, fault:v('hFault'), htype:v('hType'),
  severity:hSevVal(), action:v('hAction'), photos:healthShots.slice()
});
healthExtra = null;
```

`Object.assign` with the library fields **first** means the form always wins
on the six existing fields, so a hand-typed edit is never overwritten by a
stale library value.

## 6. Belt form — "log a fault on this belt"

After a belt entry is saved, beside the existing confirmation:

```js
if (window.HealthLib) {
  HealthLib.openFor(entry, idx, e => { healthExtra = e; go('health'); });
}
```

`idx` is the belt entry's index in `call.entries[]`, stored on the health
entry as `beltRef`. This is the flow you asked for: belt spec first, fault
second, asset and belt technology carried across with nothing re-typed.

## 7. Library screen — nav and render

```js
if (window.HealthLib) HealthLib.render();      // on entering 's-faults'
```

Plus a menu item pointing at `s-faults`, alongside the manuals one.

---

## Deliberately not built

**No blocking root-cause gate.** The catalogue knows which faults commonly
cause which others, and the picker surfaces them as tappable chips — tap one
and it logs as a second finding carrying the same asset. It does not stop you
saving. Blocking a save mid-call to demand a root cause is the app pushing
tasks at you, which is ruled out.

**Reference images ship empty.** The library seeds text-only. Images are added
on device through `HealthLib.addImage()`, or imported as a pack. Seeding 80
checks with photos would put roughly 30 MB into a public repo, and several of
the available photos were taken inside a customer's plant — `customerSafe`
needs deciding per image, not defaulting to true.

**The seed is fetched, not embedded.** `health-seed.json` is 84 KB of generic
reference data with no customer content, so it ships in the repo and is
fetched same-origin once on first run. Add it to the service worker precache
list so the library survives offline. After the first load nothing is fetched
again.
