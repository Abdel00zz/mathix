/* ============================================================================
 * MathFlow — Chrome du Hub Programme & Bibliothèque (Bannière, Onglets, Reprise)
 * ============================================================================ */
(function (global) {
  'use strict';

  var TABS = [
    ['learn', 'Apprendre'],
    ['examens', 'Examens Nationaux'],
    ['problemes', 'Problèmes'],
    ['prepa', 'Prépa Concours']
  ];

  var CLASS_TITLES = {
    'tronc-commun-sc': 'Tronc Commun Scientifique',
    '1ere-bac-sc-ex': '1ère Bac Sciences Expérimentales',
    '1ere-bac-sc-math': '1ère Bac Sciences Mathématiques',
    '2eme-bac-sc-ex': '2ème Bac Sciences Expérimentales',
    '2eme-bac-sc-math': '2ème Bac Sciences Mathématiques'
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function buildGreetingAndTabsHtml(activeTab, classId, classLabel) {
    var app = global.MathFlowApp;
    var p = app && typeof app.getProfile === 'function' ? app.getProfile() : {};
    var name = String(p.fn || '').trim() || 'Ali';
    var classes = app && typeof app.getCachedClasses === 'function' ? app.getCachedClasses() : [];
    var clsIds = classes.length ? classes.map(function (c) { return c.id; }) : Object.keys(CLASS_TITLES);

    var optionsHtml = clsIds.map(function (id) {
      var lbl = CLASS_TITLES[id] || id;
      return '<option value="' + esc(id) + '"' + (id === classId ? ' selected' : '') + '>' + esc(lbl) + '</option>';
    }).join('');

    var tabsHtml = TABS.map(function (pair) {
      var id = pair[0], lbl = pair[1], isCurrent = id === activeTab;
      return '<a class="mf-tab-pill" href="#' + id + '" data-tab="' + id + '"' + (isCurrent ? ' aria-current="page"' : '') + '>' + esc(lbl) + '</a>';
    }).join('');

    return '<div class="mf-greet" role="region" aria-label="Bannière élève">'
        + '<div class="mf-greet-txt">'
          + '<strong id="hi">Bonjour ' + esc(name) + '</strong>'
          + '<span class="mf-greet-sep" aria-hidden="true">\u00b7</span>'
          + '<span class="mf-greet-cls sub">' + esc(classLabel || CLASS_TITLES[classId] || classId) + '</span>'
          + '<span class="mf-greet-sep" aria-hidden="true">\u00b7</span>'
          + '<span>Une notion, un quiz, un pas de plus.</span>'
        + '</div>'
        + '<div class="mf-greet-act">'
          + '<select class="mf-cls-picker" data-cls-select aria-label="Changer de filière" title="Changer de filière">' + optionsHtml + '</select>'
        + '</div>'
      + '</div>'
      + '<div class="mf-tabs-wrap">'
        + '<nav class="mf-tabs-dock" aria-label="Rubriques principales">' + tabsHtml + '</nav>'
      + '</div>';
  }

  global.MathFlowProgrammeChrome = {
    CLASS_TITLES: CLASS_TITLES,
    buildGreetingAndTabsHtml: buildGreetingAndTabsHtml
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
