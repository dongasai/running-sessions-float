/**
 * Client half of the running-sessions dock.
 *
 * The dock is one `sidebar.footer.action` entry: it participates in layout at
 * the top of the sidebar's foot action area, above the official footer
 * actions, so it never covers the workspace/session list the way a fixed
 * overlay did. The sidebar collapses to a 56px rail; there the entry becomes a
 * compact count chip instead of a full-width list.
 *
 * Data comes from the framework standard hooks the slot already provides:
 * `useSessions` (session catalog with `displayTitle`/`running`/`updatedAt`) and
 * `useSessionStatus` (live run state plus the pending-user-interaction class).
 * Nothing is polled; both hooks are observable snapshots maintained elsewhere.
 */
window.__ModuleLoader__.load({
  id: '@local/running-sessions-float',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useMemo, useState } = React;

    /** Locale namespace owned by this plugin. */
    const NS = 'local.runningSessions';

    /** Visible copy for the two built-in locales. */
    const DICTS = {
      en: {
        title: 'In progress',
        running: 'Running',
        approval: 'Awaiting approval',
        plan: 'Plan review',
        answer: 'Awaiting answer',
        empty: 'Nothing in progress',
        openHint: 'Open this session',
      },
      zh: {
        title: '进行中',
        running: '运行中',
        approval: '等待审批',
        plan: '计划待审',
        answer: '等待回答',
        empty: '暂无进行中',
        openHint: '打开这个会话',
      },
    };

    /** Copy used before the locale service resolves the active language. */
    const FALLBACK = 'zh';

    const CSS = `
/* The sidebar foot lays its action row out as one flex row. The dock wants its
   own row above the official actions, so this rule turns that row into a
   column. It addresses the slot anchor the renderer exposes (display:contents,
   so its children are the flex items) rather than the shell's hashed class. */
div:has(> [data-slot="sidebar.footer.action"] > .rsf-dock) {
  flex-direction: column;
  align-items: stretch;
}
.rsf-dock {
  flex: none;
  width: 100%;
  max-height: min(46vh, 380px);
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-sizing: border-box;
  padding: 6px 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 1.45;
}
/* Idle posture: one thin, unframed line, so an empty dock costs the smallest
   possible slice of the foot area without disappearing entirely. */
.rsf-dock.rsf-empty {
  gap: 0;
  padding: 2px 6px;
  border-color: transparent;
  background: transparent;
}
.rsf-dock.rsf-empty .rsf-head {
  padding: 0;
  gap: 6px;
}
.rsf-dock.rsf-empty .rsf-title {
  font-size: 11px;
  font-weight: 400;
  color: var(--dsw-alias-label-secondary);
}
/* Collapsed rail: the foot is 56px wide and centers one icon, so the entry
   shrinks to a round count chip instead of squeezing the list. */
.rsf-rail {
  flex: none;
  width: 36px;
  height: 36px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border-radius: 50%;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.rsf-rail.rsf-idle {
  background: transparent;
}
.rsf-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 4px;
}
.rsf-pulse {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dsw-alias-state-success-primary);
  animation: rsf-pulse 1.8s ease-in-out infinite;
}
.rsf-pulse.rsf-idle {
  width: 6px;
  height: 6px;
  background: var(--dsw-alias-state-idle-primary);
  animation: none;
}
@keyframes rsf-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.75); }
}
.rsf-title {
  font-weight: 600;
  font-size: 12px;
}
.rsf-count {
  margin-left: auto;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  box-sizing: border-box;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.rsf-list {
  margin: 0;
  padding: 0;
  list-style: none;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rsf-row {
  width: 100%;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 8px;
  box-sizing: border-box;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.rsf-row:hover {
  background: var(--dsw-alias-bg-layer-2);
}
.rsf-row:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}
.rsf-row-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rsf-row-state {
  flex: none;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
}
.rsf-row-state.rsf-live {
  color: var(--dsw-alias-state-success-primary);
}
.rsf-row-state.rsf-warn {
  color: var(--dsw-alias-state-warn-primary);
}
`;
    /**
     * Subscribe the calling component to locale switches and expose the
     * namespace-bound translator, falling back to the built-in dictionaries.
     * @param locale - Client locale service, or undefined when unavailable.
     * @returns translate function for this plugin's namespace.
     */
    function useTranslator(locale) {
      const [epoch, setEpoch] = useState(0);
      useEffect(() => {
        if (!locale || typeof locale.subscribe !== 'function') return undefined;
        return locale.subscribe(() => setEpoch(value => value + 1));
      }, [locale]);
      return useMemo(() => {
        if (locale && typeof locale.bind === 'function') {
          const bound = locale.bind(NS);
          if (typeof bound === 'function') return bound;
        }
        return key => DICTS[FALLBACK][key] || DICTS.en[key] || key;
      }, [locale, epoch]);
    }

    /**
     * Classify the pending user interaction a session is blocked on.
     * @param kind - domain-owned presentation discriminator.
     * @param t - translate function.
     * @returns label text and tone class for the row state.
     */
    function pendingLabel(kind, t) {
      const normalized = String(kind || '').toLowerCase();
      if (normalized.indexOf('plan') !== -1) return { text: t('plan'), tone: 'warn' };
      if (normalized.indexOf('approval') !== -1 || normalized.indexOf('permission') !== -1) {
        return { text: t('approval'), tone: 'warn' };
      }
      return { text: t('answer'), tone: 'warn' };
    }

    /**
     * The dock. Renders a full-width block in the sidebar foot (wide sidebar)
     * or a round count chip (collapsed rail), never an overlay.
     * @param props - slot owner props (`wide`) + standard hooks, the plugin's
     * inject face, and locale.
     * @returns the dock element, the rail chip, or (wide) an idle strip.
     */
    function RunningSessionsDock(props) {
      const { useSessions, useSessionStatus, openSession, locale, wide } = props;
      const t = useTranslator(locale);
      const list = useSessions(state => state);
      const statuses = useSessionStatus(state => state);
      const rows = useMemo(() => {
        if (!list || !Array.isArray(list.ids)) return [];
        const visible = [];
        for (const id of list.ids) {
          const summary = list.byId ? list.byId[id] : undefined;
          if (!summary || summary.blank === true || summary.origin === 'subagent') continue;
          const status = statuses && typeof statuses.get === 'function' ? statuses.get(id) : undefined;
          const running = status && status.running !== undefined
            ? status.running === true
            : summary.running === true;
          const pending = status ? status.pendingInteraction : undefined;
          if (!running && !pending) continue;
          visible.push({
            id,
            title: summary.displayTitle || id,
            updatedAt: summary.updatedAt || 0,
            state: pending ? pendingLabel(pending.kind, t) : { text: t('running'), tone: 'live' },
          });
        }
        visible.sort((left, right) => right.updatedAt - left.updatedAt);
        return visible;
      }, [list, statuses, t]);

      const empty = rows.length === 0;

      // The rail has no room for a list; it shows the count so collapsing the
      // sidebar hides the rows, not the fact that something is running.
      if (wide === false) {
        const railLabel = empty ? t('empty') : t('title') + ' · ' + rows.length;
        return h(React.Fragment, null,
          h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
          h('div', {
            className: empty ? 'rsf-rail rsf-idle' : 'rsf-rail',
            role: 'status',
            title: railLabel,
            'aria-label': railLabel,
          },
            h('span', {
              className: empty ? 'rsf-pulse rsf-idle' : 'rsf-pulse',
              'aria-hidden': true,
            }),
            empty ? null : h('span', { className: 'rsf-rail-count' }, String(rows.length)),
          ),
        );
      }

      return h(React.Fragment, null,
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('section', {
          className: empty ? 'rsf-dock rsf-empty' : 'rsf-dock',
          role: 'region',
          'aria-label': t('title'),
        },
          h('header', { className: 'rsf-head' },
            h('span', {
              className: empty ? 'rsf-pulse rsf-idle' : 'rsf-pulse',
              'aria-hidden': true,
            }),
            h('span', { className: 'rsf-title' }, empty ? t('empty') : t('title')),
            empty ? null : h('span', { className: 'rsf-count' }, String(rows.length)),
          ),
          empty ? null : h('ul', { className: 'rsf-list' },
            rows.map(row => h('li', { key: row.id },
              h('button', {
                type: 'button',
                className: 'rsf-row',
                title: t('openHint') + ' — ' + row.title,
                onClick: () => { if (openSession) openSession(row.id); },
              },
                h('span', { className: 'rsf-row-title' }, row.title),
                h('span', { className: 'rsf-row-state rsf-' + row.state.tone }, row.state.text),
              ),
            )),
          ),
        ),
      );
    }

    return {
      inject: ['slots'],
      /**
       * Register the dock into the sidebar foot action slot and its locale copy.
       * @param ctx - Client Cordis context.
       */
      apply(ctx) {
        const locale = ctx.get('locale');
        if (locale && typeof locale.register === 'function') {
          ctx.effect(() => locale.register(NS, DICTS), 'running-sessions-float: dictionaries');
        }
        const uiWorkspace = ctx.get('uiWorkspace');
        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'running-sessions-float',
          // Negative order puts the dock above every official footer action
          // (they all keep the default 0), i.e. at the top of the slot content.
          order: -10,
          label: () => {
            if (locale && typeof locale.bind === 'function') {
              const bound = locale.bind(NS);
              if (typeof bound === 'function') return bound('title');
            }
            return DICTS[FALLBACK].title;
          },
          inject: () => ({
            locale,
            openSession: sessionId => {
              if (uiWorkspace && typeof uiWorkspace.openSession === 'function') {
                uiWorkspace.openSession(sessionId);
              }
            },
          }),
        }, RunningSessionsDock));
      },
    };
  },
});
