/* Lazer plugin market — reads /plugin/plugins.json and renders the catalogue. */

import {
  getLanguage,
  initLanguage,
  initLanguageMenu,
  onLanguageChange,
  pickLocalized,
  t
} from './plugin-i18n.js';

const MANIFEST_URL = '/plugin/plugins.json';

const PLATFORM_LABELS = {
  windows: 'WIN',
  macos: 'MAC',
  linux: 'LINUX',
  android: 'AND',
  ios: 'IOS'
};

const state = {
  plugins: [],
  filter: 'all',
  query: '',
  sort: 'default',
  status: 'loading'
};

const listElement = document.querySelector('#plugin-list');
const emptyElement = document.querySelector('#plugin-empty');
const searchElement = document.querySelector('#plugin-search');
const sortButtons = Array.from(document.querySelectorAll('[data-sort]'));
const filterButtons = Array.from(document.querySelectorAll('[data-filter]'));
const statElements = Array.from(document.querySelectorAll('[data-stat]'));

function safeUrl(value) {
  if (!value || typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch (error) {
    return null;
  }
}

function formatDate(value) {
  if (!value || typeof value !== 'string') return '—';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : value;
}

function localizedSearchText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return Object.values(value).join(' ');
}

function normalizePlugin(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  if (!raw.name || !raw.summary) return null;
  return {
    id: raw.id,
    name: raw.name,
    summary: raw.summary,
    author: typeof raw.author === 'string' ? raw.author : '',
    authorUrl: safeUrl(raw.authorUrl),
    type: raw.type === 'closed-source' ? 'closed-source' : 'open-source',
    version: typeof raw.version === 'string' ? raw.version : '—',
    license: typeof raw.license === 'string' ? raw.license : '',
    repo: safeUrl(raw.repo),
    download: safeUrl(raw.download),
    homepage: safeUrl(raw.homepage),
    platforms: Array.isArray(raw.platforms) ? raw.platforms.filter((platform) => PLATFORM_LABELS[platform]) : [],
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag) => typeof tag === 'string') : [],
    minAppVersion: typeof raw.minAppVersion === 'string' ? raw.minAppVersion : '',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
    searchText: [
      raw.id,
      localizedSearchText(raw.name),
      localizedSearchText(raw.summary),
      typeof raw.author === 'string' ? raw.author : '',
      ...(Array.isArray(raw.tags) ? raw.tags : [])
    ].join(' ').toLowerCase()
  };
}

function filteredPlugins() {
  const query = state.query.trim().toLowerCase();
  const plugins = state.plugins.filter((plugin) => {
    if (state.filter !== 'all' && plugin.type !== state.filter) return false;
    if (query && !plugin.searchText.includes(query)) return false;
    return true;
  });

  if (state.sort === 'updated') {
    return plugins.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  return plugins;
}

function updateStats() {
  const total = state.plugins.length;
  const open = state.plugins.filter((plugin) => plugin.type === 'open-source').length;
  const closed = total - open;
  const latest = state.plugins.reduce((max, plugin) => (plugin.updatedAt > max ? plugin.updatedAt : max), '');

  const values = { total, open, closed, updated: latest ? formatDate(latest).slice(5) : '—' };
  statElements.forEach((element) => {
    const value = values[element.dataset.stat];
    element.textContent = typeof value === 'number' ? String(value).padStart(2, '0') : value;
  });

  const counts = { all: total, 'open-source': open, 'closed-source': closed };
  filterButtons.forEach((button) => {
    const countElement = button.querySelector('[data-count]');
    if (countElement) countElement.textContent = String(counts[button.dataset.filter] ?? 0);
  });
}

function buildAction(label, url, primary = false) {
  if (!url) return null;
  const link = document.createElement('a');
  link.className = `plugin-action${primary ? ' is-primary' : ''}`;
  link.href = url;
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.innerHTML = `<span>${label}</span><span aria-hidden="true">↗</span>`;
  return link;
}

function buildPluginRow(plugin, index) {
  const article = document.createElement('article');
  article.className = 'plugin-row';
  article.dataset.pluginId = plugin.id;

  const number = document.createElement('span');
  number.className = 'plugin-no';
  number.textContent = `P-${String(index + 1).padStart(2, '0')}`;

  const main = document.createElement('div');
  main.className = 'plugin-main';

  const titleLine = document.createElement('div');
  titleLine.className = 'plugin-title-line';

  const title = document.createElement('h3');
  title.textContent = pickLocalized(plugin.name);
  titleLine.append(title);

  const summary = document.createElement('p');
  summary.className = 'plugin-summary';
  summary.textContent = pickLocalized(plugin.summary);

  const meta = document.createElement('div');
  meta.className = 'plugin-meta';

  if (plugin.author) {
    const author = document.createElement(plugin.authorUrl ? 'a' : 'span');
    author.className = 'plugin-author';
    author.textContent = `BY ${plugin.author}`;
    if (plugin.authorUrl) {
      author.href = plugin.authorUrl;
      author.target = '_blank';
      author.rel = 'noreferrer';
    }
    meta.append(author);
  }

  if (plugin.platforms.length) {
    const platforms = document.createElement('span');
    platforms.className = 'plugin-platforms';
    plugin.platforms.forEach((platform) => {
      const item = document.createElement('span');
      item.className = 'plugin-platform';
      item.textContent = PLATFORM_LABELS[platform];
      platforms.append(item);
    });
    meta.append(platforms);
  }

  plugin.tags.forEach((tag) => {
    const item = document.createElement('span');
    item.className = 'plugin-tag';
    item.textContent = `#${tag.toUpperCase()}`;
    meta.append(item);
  });

  main.append(titleLine, summary, meta);

  const typeCell = document.createElement('div');
  typeCell.className = 'plugin-cell plugin-type';
  const typeBadge = document.createElement('span');
  typeBadge.className = `type-badge ${plugin.type === 'open-source' ? 'is-open' : 'is-closed'}`;
  typeBadge.dataset.typeLabel = plugin.type;
  typeBadge.textContent = plugin.type === 'open-source'
    ? (getLanguage() === 'zh-CN' ? '开源' : '')
    : (getLanguage() === 'zh-CN' ? '闭源' : '');
  const license = document.createElement('small');
  license.textContent = plugin.type === 'open-source' ? (plugin.license || 'OPEN SOURCE') : 'PROPRIETARY';
  typeCell.append(typeBadge, license);

  const versionCell = document.createElement('div');
  versionCell.className = 'plugin-cell plugin-version';
  const version = document.createElement('b');
  version.textContent = plugin.version;
  const minVersion = document.createElement('small');
  minVersion.textContent = plugin.minAppVersion ? `MIN ${plugin.minAppVersion}` : 'LATEST';
  versionCell.append(version, minVersion);

  const updatedCell = document.createElement('div');
  updatedCell.className = 'plugin-cell plugin-updated';
  const updated = document.createElement('b');
  updated.textContent = formatDate(plugin.updatedAt);
  const id = document.createElement('small');
  id.textContent = plugin.id.toUpperCase();
  updatedCell.append(updated, id);

  const actions = document.createElement('div');
  actions.className = 'plugin-actions';

  if (plugin.type === 'open-source') {
    const repoAction = buildAction('REPO', plugin.repo);
    if (repoAction) actions.append(repoAction);
    const getAction = buildAction('GET', plugin.download, true);
    if (getAction) actions.append(getAction);
  } else {
    const getAction = buildAction('GET', plugin.download, true);
    if (getAction) actions.append(getAction);
    const homeAction = buildAction('HOME', plugin.homepage);
    if (homeAction) actions.append(homeAction);
  }

  article.append(number, main, typeCell, versionCell, updatedCell, actions);
  return article;
}

function updateDynamicLabels() {
  const language = getLanguage();
  const typeLabels = {
    'open-source': { 'zh-CN': '开源', 'zh-Hant': '開源', ja: 'オープンソース', en: 'OPEN SOURCE' },
    'closed-source': { 'zh-CN': '闭源', 'zh-Hant': '閉源', ja: 'クローズド', en: 'CLOSED SOURCE' }
  };

  document.querySelectorAll('[data-type-label]').forEach((element) => {
    const labels = typeLabels[element.dataset.typeLabel] || typeLabels['open-source'];
    element.textContent = labels[language] || labels.en;
  });
}

function renderSkeleton() {
  listElement.replaceChildren();
  emptyElement.hidden = true;
  for (let index = 0; index < 3; index += 1) {
    const row = document.createElement('div');
    row.className = 'plugin-row plugin-skeleton';
    row.innerHTML = `
      <span class="skeleton-block skeleton-no"></span>
      <span class="skeleton-main">
        <span class="skeleton-block skeleton-title"></span>
        <span class="skeleton-block skeleton-copy"></span>
      </span>
      <span class="skeleton-block skeleton-short"></span>
      <span class="skeleton-block skeleton-short"></span>
      <span class="skeleton-block skeleton-short"></span>
      <span class="skeleton-block skeleton-action"></span>
    `;
    listElement.append(row);
  }
}

function renderState(title, hint, retry = false) {
  listElement.replaceChildren();
  emptyElement.hidden = false;
  emptyElement.replaceChildren();

  const titleElement = document.createElement('p');
  titleElement.className = 'market-empty-title';
  titleElement.textContent = title;

  const hintElement = document.createElement('p');
  hintElement.className = 'market-empty-hint';
  hintElement.textContent = hint;

  emptyElement.append(titleElement, hintElement);

  if (retry) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button-solid market-retry';
    button.textContent = t('retry', '重试');
    button.addEventListener('click', loadPlugins);
    emptyElement.append(button);
  }
}

function render() {
  if (state.status === 'loading') {
    renderSkeleton();
    return;
  }

  if (state.status === 'error') {
    renderState(
      t('loadError', 'plugins.json 读取失败。'),
      'GET /plugin/plugins.json',
      true
    );
    return;
  }

  const plugins = filteredPlugins();
  listElement.replaceChildren();
  emptyElement.hidden = plugins.length !== 0;

  if (!plugins.length) {
    const title = document.createElement('p');
    title.className = 'market-empty-title';
    title.textContent = t('emptyTitle', '没有匹配的插件。');
    const hint = document.createElement('p');
    hint.className = 'market-empty-hint';
    hint.textContent = t('emptyHint', '换个关键词，或者提交第一个。');
    emptyElement.replaceChildren(title, hint);
    return;
  }

  plugins.forEach((plugin, index) => {
    listElement.append(buildPluginRow(plugin, index));
  });
  updateDynamicLabels();
}

async function loadPlugins() {
  state.status = 'loading';
  listElement.setAttribute('aria-busy', 'true');
  render();

  try {
    const response = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = await response.json();
    if (!manifest || !Array.isArray(manifest.plugins)) throw new Error('Invalid manifest');

    state.plugins = manifest.plugins.map(normalizePlugin).filter(Boolean);
    state.status = 'ready';
    updateStats();
  } catch (error) {
    state.status = 'error';
    state.plugins = [];
    updateStats();
  } finally {
    listElement.setAttribute('aria-busy', 'false');
    render();
  }
}

function bindControls() {
  searchElement.addEventListener('input', (event) => {
    state.query = event.target.value;
    render();
  });

  sortButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.sort = button.dataset.sort;
      sortButtons.forEach((item) => item.classList.toggle('is-active', item === button));
      button.setAttribute('aria-pressed', 'true');
      sortButtons.filter((item) => item !== button).forEach((item) => item.setAttribute('aria-pressed', 'false'));
      render();
    });
  });

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.filter = button.dataset.filter;
      filterButtons.forEach((item) => item.classList.toggle('is-active', item === button));
      button.setAttribute('aria-pressed', 'true');
      filterButtons.filter((item) => item !== button).forEach((item) => item.setAttribute('aria-pressed', 'false'));
      render();
    });
  });
}

function init() {
  initLanguage();
  initLanguageMenu();
  bindControls();
  onLanguageChange(() => {
    render();
  });
  loadPlugins();
}

init();
