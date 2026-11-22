// A very small template runtime: {{holes}}, <sc-if>, <sc-for>, and a keyed DOM patch.
// Nodes are reused between draws, so running CSS animations are never restarted.
type Scope = Record<string, any>;
type VNode = { k: string; text?: string; tag?: string; ns?: string; attrs?: Record<string, string>; on?: Record<string, (e: Event) => void>; kids?: VNode[] };

export class View {
  props: any;
  state: any = {};
  __draw: () => void = () => {};
  constructor(props: any) { this.props = props; }
  setState(s: Scope) { this.state = { ...this.state, ...s }; this.__draw(); }
  renderVals(): Scope { return {}; }
  componentDidMount() {}
}

const WHOLE = /^\s*\{\{([^}]+)\}\}\s*$/;
function lookup(scope: Scope, path: string): any {
  path = path.trim();
  if (path === 'true') return true;
  if (path === 'false') return false;
  let v: any = scope;
  for (const k of path.split('.')) { if (v == null) return undefined; v = v[k]; }
  return v;
}
function subst(scope: Scope, str: string): any {
  const m = str.match(WHOLE);
  if (m) return lookup(scope, m[1]);
  return str.replace(/\{\{([^}]+)\}\}/g, (_, p) => { const v = lookup(scope, p); return v == null ? '' : v; });
}

let uid = 0;
function tag(n: any) { if (n.nodeType === 1 || n.nodeType === 3) { n.__id = ++uid; n.childNodes.forEach(tag); } }

function build(n: any, scope: Scope, key: string, out: VNode[]) {
  if (n.nodeType === 3) { const t = subst(scope, n.nodeValue); out.push({ k: key + n.__id, text: t == null ? '' : String(t) }); return; }
  if (n.nodeType !== 1) return;
  const name = n.tagName.toLowerCase();
  if (name === 'sc-if') {
    if (lookup(scope, (n.getAttribute('value').match(WHOLE) || [0, 'false'])[1])) n.childNodes.forEach((c: any) => build(c, scope, key, out));
    return;
  }
  if (name === 'sc-for') {
    const list = subst(scope, n.getAttribute('list')) || [], as = n.getAttribute('as');
    list.forEach((item: any, i: number) => { const s2 = { ...scope, [as]: item }; n.childNodes.forEach((c: any) => build(c, s2, key + i + '/', out)); });
    return;
  }
  const v: VNode = { k: key + n.__id, tag: name, ns: n.namespaceURI, attrs: {}, on: {}, kids: [] };
  for (const a of n.attributes) {
    const val = subst(scope, a.value);
    if (typeof val === 'function') { const ev = a.name.replace(/^sc-on/, '').toLowerCase(); v.on![ev === 'change' ? 'input' : ev] = val; continue; }
    if (val === false || val == null) continue;
    v.attrs![a.name] = val === true ? '' : String(val);
  }
  n.childNodes.forEach((c: any) => build(c, scope, key, v.kids!));
  out.push(v);
}

function patch(parent: any, kids: VNode[]) {
  const old = new Map<string, any>();
  parent.childNodes.forEach((c: any) => { if (c.__k) old.set(c.__k, c); });
  let ref = parent.firstChild;
  for (const v of kids) {
    let el = old.get(v.k);
    if (el) old.delete(v.k);
    if (v.text !== undefined) {
      if (!el) { el = document.createTextNode(v.text); el.__k = v.k; } else if (el.nodeValue !== v.text) el.nodeValue = v.text;
    } else {
      if (!el) { el = document.createElementNS(v.ns!, v.tag!); el.__k = v.k; el.__a = {}; el.__h = {}; }
      for (const a in v.attrs) if (el.__a[a] !== v.attrs[a]) {
        el.setAttribute(a, v.attrs[a]);
        if (a === 'value' && 'value' in el && document.activeElement !== el) el.value = v.attrs[a];
      }
      for (const a in el.__a) if (!(a in v.attrs!)) el.removeAttribute(a);
      el.__a = v.attrs;
      for (const e in v.on) { if (!el.__h[e]) { const node = el; node.addEventListener(e, (ev: Event) => node.__h[e](ev)); } el.__h[e] = v.on[e]; }
      patch(el, v.kids!);
    }
    if (el !== ref) parent.insertBefore(el, ref); else ref = ref.nextSibling;
  }
  old.forEach((c) => c.remove());
}

export function mount<T extends View>(host: Element, templateHtml: string, Comp: new (props: any) => T, props: any): T {
  const tpl = document.createElement('template');
  // Bound handlers are written onClick="{{fn}}" in the templates. Rename them before parsing: Chrome reports every
  // on* attribute it parses as a CSP inline-script violation, even inside an inert <template>.
  tpl.innerHTML = templateHtml.replace(/\son([a-z]+)=(["'])\{\{/gi, ' sc-on$1=$2{{');
  tpl.content.childNodes.forEach(tag);
  const inst = new Comp(props);
  let queued = false;
  const draw = () => { const kids: VNode[] = []; tpl.content.childNodes.forEach((c) => build(c, inst.renderVals(), '', kids)); patch(host, kids); };
  inst.__draw = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; draw(); }); };
  host.replaceChildren();
  draw();
  inst.componentDidMount();
  return inst;
}
