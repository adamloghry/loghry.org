// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { View, mount } from '../../src/sky/view';

// Draws are batched to the next animation frame; run them synchronously here.
beforeEach(() => { vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { f(0); return 0; }); });

class Box extends View {
  renderVals() { return this.state; }
}
const TPL = '<p class="t">{{a.b}} and {{c}}</p><sc-if value="{{show}}"><em>shown</em></sc-if>'
  + '<ul><sc-for list="{{items}}" as="it"><li data-n="{{it.n}}">{{it.n}}</li></sc-for></ul><button disabled="{{off}}">x</button>';

function setup(state: Record<string, unknown>) {
  const host = document.createElement('div');
  const inst = mount(host, TPL, class extends Box { constructor(p: unknown) { super(p); this.state = state; } }, {});
  return { host, inst };
}

describe('template runtime', () => {
  it('fills holes, including dotted paths and missing values', () => {
    const { host } = setup({ a: { b: 'one' }, items: [] });
    expect(host.querySelector('.t')!.textContent).toBe('one and ');
  });
  it('sc-if drops its subtree when false and adds it when true', () => {
    const { host, inst } = setup({ show: false, items: [] });
    expect(host.querySelector('em')).toBeNull();
    inst.setState({ show: true });
    expect(host.querySelector('em')!.textContent).toBe('shown');
  });
  it('sc-for renders one copy per item', () => {
    const { host } = setup({ items: [{ n: 1 }, { n: 2 }, { n: 3 }] });
    expect([...host.querySelectorAll('li')].map((l) => l.textContent)).toEqual(['1', '2', '3']);
  });
  it('keeps the same DOM node across redraws, so CSS animations are not restarted', () => {
    const { host, inst } = setup({ a: { b: 'x' }, items: [{ n: 1 }] });
    const p = host.querySelector('.t'), li = host.querySelector('li');
    inst.setState({ a: { b: 'y' } });
    expect(host.querySelector('.t')).toBe(p);
    expect(host.querySelector('li')).toBe(li);
    expect(p!.textContent).toBe('y and ');
  });
  it('an attribute bound to false is removed, true makes it present', () => {
    const { host, inst } = setup({ off: true, items: [] });
    expect(host.querySelector('button')!.hasAttribute('disabled')).toBe(true);
    inst.setState({ off: false });
    expect(host.querySelector('button')!.hasAttribute('disabled')).toBe(false);
  });
  it('never parses an inline event-handler attribute (Chrome reports each one as a CSP violation, even inside <template>)', () => {
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')!;
    const parsed: string[] = [];
    Object.defineProperty(Element.prototype, 'innerHTML', { ...desc, set(v: string) { parsed.push(v); desc.set!.call(this, v); } });
    try {
      mount(document.createElement('div'), '<button onClick="{{go}}">go</button><input onChange="{{go}}">', class extends View { renderVals() { return { go: () => {} }; } }, {});
    } finally { Object.defineProperty(Element.prototype, 'innerHTML', desc); }
    expect(parsed).toHaveLength(1); // the template really was parsed through innerHTML
    expect(parsed.join('')).not.toMatch(/\son[a-z]+=/i);
  });
  it('binds on* attributes to handlers instead of setting them', () => {
    const onClick = vi.fn();
    const host = document.createElement('div');
    mount(host, '<button onClick="{{go}}">go</button>', class extends View { renderVals() { return { go: onClick }; } }, {});
    const b = host.querySelector('button')!;
    expect(b.hasAttribute('onclick')).toBe(false);
    b.click();
    expect(onClick).toHaveBeenCalledOnce();
  });
});
