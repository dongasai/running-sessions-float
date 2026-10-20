/**
 * Headless smoke test for the browser half.
 *
 * Loads `client.js` in a vm with a minimal React stub, fakes the two standard
 * hooks the slot provides, and renders the registered component as a plain
 * object tree. No DOM, no browser, no dependencies.
 *
 * Run from the repository root: `node test/smoke.mjs`
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const clientPath = join(here, '..', 'running-sessions-float', 'client.js');
const source = readFileSync(clientPath, 'utf8');

const Fragment = Symbol('Fragment');
const React = {
  createElement(type, props, ...children) {
    return { type, props: { ...(props || {}), children } };
  },
  Fragment,
  useMemo: (fn) => fn(),
  useState: (init) => [init, () => {}],
  useEffect: () => {},
};

let factory;
const sandbox = {
  window: { __ModuleLoader__: { load: (entry) => { factory = entry.factory; } } },
  console,
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const app = factory((name) => {
  if (name === 'react') return React;
  throw new Error('unexpected require ' + name);
});

/** Locale stub that resolves through the dictionaries the plugin registers. */
const locale = {
  dicts: null,
  registered: null,
  register(ns, dicts) {
    this.registered = { ns, dicts };
    this.dicts = dicts;
  },
  subscribe() {
    return () => {};
  },
  bind() {
    return (key) => this.dicts?.zh?.[key] ?? key;
  },
};

const openedIds = [];
let registered;

function applyWith(openSession) {
  const ctx = {
    get(name) {
      if (name === 'locale') return locale;
      if (name === 'uiWorkspace') return openSession === undefined ? undefined : { openSession };
      return undefined;
    },
    effect(fn) { fn(); },
    slots: {
      inject: (_name, fn) => fn(),
      register(spec, component) {
        registered = { spec, component };
        return () => {};
      },
    },
  };
  app.apply(ctx);
  return registered.component;
}

const component = applyWith((id) => openedIds.push(id));

const summary = (id, patch) => ({
  id,
  displayTitle: patch.title || id,
  updatedAt: patch.updatedAt || 0,
  running: patch.running === true,
  blank: patch.blank === true,
  origin: patch.origin,
  retainedBy: {},
});

const listState = {
  ids: ['run', 'approve', 'plan', 'question', 'blank', 'sub', 'idle', 'unknown'],
  byId: {
    run: summary('run', { title: '运行中的会话', updatedAt: 500, running: true }),
    approve: summary('approve', { title: '等审批', updatedAt: 900 }),
    plan: summary('plan', { title: '等计划审', updatedAt: 800 }),
    question: summary('question', { title: '等回答', updatedAt: 700 }),
    blank: summary('blank', { title: '空白', updatedAt: 950, running: true, blank: true }),
    sub: summary('sub', { title: '子代理', updatedAt: 940, running: true, origin: 'subagent' }),
    idle: summary('idle', { title: '空闲', updatedAt: 930, running: false }),
    unknown: summary('unknown', { title: '未知待办', updatedAt: 600 }),
  },
};
const statusState = new Map([
  ['approve', { running: false, pendingInteraction: { kind: 'approval' } }],
  ['plan', { running: false, pendingInteraction: { kind: 'plan-review' } }],
  ['question', { running: false, pendingInteraction: { kind: 'question' } }],
  ['unknown', { running: false, pendingInteraction: { kind: 'permission' } }],
]);

const render = (component, sessions, statuses, options = {}) => component({
  useSessions: (select) => select(sessions),
  useSessionStatus: (select) => select(statuses),
  openSession: options.openSession,
  locale: options.locale,
  wide: options.wide,
});

/** Collect every string below one stub element. */
function textOf(node) {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (!node || typeof node !== 'object') return '';
  return textOf(node.props?.children);
}

/** Flatten the stub element tree into sections, buttons, rails, styles, text. */
function inspect(tree) {
  const texts = [];
  const sections = [];
  const buttons = [];
  const rails = [];
  const styles = [];
  const walk = (node) => {
    if (node === null || node === undefined || node === false) return;
    if (typeof node === 'string') { texts.push(node); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node !== 'object') return;
    if (node.type === 'section') sections.push(node);
    if (node.type === 'button') buttons.push(node);
    if (node.type === 'style') styles.push(node);
    if (String(node.props?.className || '').split(/\s+/).includes('rsf-rail')) rails.push(node);
    walk(node.props?.children);
  };
  walk(tree);
  const rows = buttons.map((button) => {
    const children = button.props.children;
    const title = children.find((child) => child?.props?.className === 'rsf-row-title');
    const state = children.find((child) => String(child?.props?.className || '').startsWith('rsf-row-state'));
    return {
      title: [].concat(title?.props?.children ?? []).join(''),
      state: [].concat(state?.props?.children ?? []).join(''),
      stateClass: state?.props?.className,
      onClick: button.props.onClick,
    };
  });
  return { texts, sections, rows, rails, styles };
}

const view = inspect(render(component, listState, statusState, { openSession: (id) => openedIds.push(id) }));
const empty = inspect(render(component, { ids: ['idle'], byId: { idle: listState.byId.idle } }, new Map()));
const fallback = inspect(render(component, { ids: [], byId: {} }, new Map(), { locale: undefined }));
const noOp = inspect(render(component, listState, statusState, { openSession: undefined }));
const rail = inspect(render(component, listState, statusState, { wide: false }));
const railEmpty = inspect(render(component, { ids: ['idle'], byId: { idle: listState.byId.idle } }, new Map(), { wide: false }));
const css = view.styles[0]?.props?.dangerouslySetInnerHTML?.__html || '';

let failures = 0;
const check = (name, pass) => {
  console.log((pass ? 'PASS ' : 'FAIL ') + name);
  if (!pass) failures += 1;
};

check('dock class', view.sections[0]?.props?.className === 'rsf-dock');
check('five rows (blank / subagent / idle filtered)', view.rows.length === 5);
check('rows sorted by updatedAt desc',
  JSON.stringify(view.rows.map((row) => row.title)) ===
  JSON.stringify(['等审批', '等计划审', '等回答', '未知待办', '运行中的会话']));
check('state labels', JSON.stringify(view.rows.map((row) => row.state)) ===
  JSON.stringify(['等待审批', '计划待审', '等待回答', '等待审批', '运行中']));
check('count badge', view.texts.includes('5'));
check('running tone class', view.rows[4].stateClass === 'rsf-row-state rsf-live');
check('pending tone class', view.rows[0].stateClass === 'rsf-row-state rsf-warn');
view.rows[0].onClick();
check('click forwards the session id', openedIds[0] === 'approve');
check('empty dock class', empty.sections[0]?.props?.className === 'rsf-dock rsf-empty');
check('empty copy', empty.texts.includes('暂无进行中'));
check('empty state has no count badge', !empty.texts.some((text) => /^\d+$/.test(text)));
check('empty state has no rows', empty.rows.length === 0);
check('zh fallback without locale service', fallback.texts.includes('暂无进行中'));
let threw = false;
try {
  for (const row of noOp.rows) row.onClick();
} catch {
  threw = true;
}
check('missing openSession degrades to a no-op', threw === false);
check('rail mode renders a chip, not the list',
  rail.rails.length === 1 && rail.sections.length === 0 && rail.rows.length === 0);
check('rail chip carries the count',
  rail.rails[0]?.props?.['aria-label'] === '进行中 · 5' && textOf(rail.rails[0]) === '5');
check('rail chip with nothing running has no count',
  railEmpty.rails[0]?.props?.className === 'rsf-rail rsf-idle' && textOf(railEmpty.rails[0]) === '');
check('dock CSS is in normal flow, not a fixed overlay',
  !/position:\s*fixed/.test(css) && css.includes('data-slot="sidebar.footer.action"'));

// The footer row must be allowed to wrap: every entry asks for a full line with a
// 100% flex basis, so a non-wrapping row squeezes the official entries out of the
// sidebar. Promote from the component as well, for clients without :has().
const seat = view.sections[0]?.props?.ref;
const closestCalls = [];
const footerStyle = {};
// Real shape: the outlet anchor (display: contents) is the footer row's only
// element child, and the dock plus the official entries are its children. The
// row must be promoted even though it has a single child.
const footerRow = { style: footerStyle, children: [{}] };
const seatNode = {
  closest(selector) {
    closestCalls.push(selector);
    return selector === '[data-slot="sidebar.footer.action"]'
      ? { parentElement: footerRow }
      : null;
  },
};
seat?.(seatNode);
check('dock makes the footer row wrap',
  typeof seat === 'function' && footerStyle.flexWrap === 'wrap' && footerStyle.alignItems === 'stretch');
check('promotion targets the slot anchor, not a hashed host class',
  closestCalls[0] === '[data-slot="sidebar.footer.action"]');
check('promotion works while the anchor is the row\'s only element child',
  footerRow.style.flexWrap === 'wrap' && footerRow.children.length === 1);
seat?.(null);
check('unmount restores the footer row',
  footerStyle.flexWrap === '' && footerStyle.alignItems === '');

check('en dictionary registered', locale.registered?.dicts?.en?.title === 'In progress');

// Package + bundle contract, so a manifest/patch drift fails here instead of at install time.
const root = join(here, '..', 'running-sessions-float');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const patchText = readFileSync(join(root, 'cordis.patch.yml'), 'utf8');
const clientId = /id:\s*'([^']+)'/.exec(source)?.[1];
const dicts = locale.registered?.dicts ?? {};
const zhKeys = Object.keys(dicts.zh ?? {}).sort();
const enKeys = Object.keys(dicts.en ?? {}).sort();
check('client id matches package name', clientId === pkg.name);
check('slot is the sidebar foot action slot', registered.spec.name === 'sidebar.footer.action');
check('order places the dock above official footer actions', registered.spec.order < 0);
check('patch inserts this bundle',
  patchText.includes(`id: running-sessions-float`) && patchText.includes(`name: '${pkg.name}'`));
check('files list ships the runtime files',
  ['index.js', 'client.js', 'cordis.patch.yml'].every((file) => pkg.files.includes(file)));
check('zh and en dictionaries have the same keys', JSON.stringify(zhKeys) === JSON.stringify(enKeys));
const usedKeys = [...source.matchAll(/\bt\('([^']+)'\)/g)].map((match) => match[1]);
check('every t() key exists in both dictionaries',
  usedKeys.length > 0 && usedKeys.every((key) => zhKeys.includes(key) && enKeys.includes(key)));
const requires = [...source.matchAll(/require\(\s*'([^']+)'\s*\)/g)].map((match) => match[1]);
check('client bundle only requires react', JSON.stringify(requires) === JSON.stringify(['react']));

console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
process.exitCode = failures === 0 ? 0 : 1;
