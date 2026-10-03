// 2026-10-03 17:14, single source of truth for the tablet background presets (Figma "Luxury Gradients").
// Used by the tablet page (applyTabletLook), the dashboard picker, and the server (enum validation: require()d by PropertyController).
// group = light | dark decides the text treatment: light gradients force dark text on light glass, dark gradients the reverse.
// linear = the gradient's own "Linear" from Figma, reused for primary buttons. scrim (optional) darkens the lightest region for AA.
(function (root) {
  var BACKGROUNDS = [
    { slug: 'manhattan-ice',  name: 'Manhattan Ice',  group: 'light', file: 'manhattan-ice.webp',  fallback: '#E9D7D1', linear: ['#D5CBD3', '#F9E1C5'] },
    { slug: 'apricot-storm',  name: 'Apricot Storm',  group: 'light', file: 'apricot-storm.webp',  fallback: '#F4AC91', linear: ['#EDDAD2', '#F6AF95'] },
    { slug: 'barley-titan',   name: 'Barley Titan',   group: 'light', file: 'barley-titan.webp',   fallback: '#EBE3DF', linear: ['#D2D9E8', '#E9E0E0'] },
    { slug: 'silver-cloud',   name: 'Silver Cloud',   group: 'light', file: 'silver-cloud.webp',   fallback: '#BBB8B5', linear: ['#AFABA8', '#C9C5C2'] },
    { slug: 'erie-charcoal',  name: 'Erie Charcoal',  group: 'dark',  file: 'erie-charcoal.webp',  fallback: '#454545', linear: ['#252425', '#636363'], scrim: 'rgba(0, 0, 0, 0.15)' },
    { slug: 'burnham-stone',  name: 'Burnham Stone',  group: 'dark',  file: 'burnham-stone.webp',  fallback: '#074E43', linear: ['#015B4F', '#022D24'], scrim: 'rgba(0, 0, 0, 0.22)' },
    { slug: 'baltic-rose',    name: 'Baltic Rose',    group: 'dark',  file: 'baltic-rose.webp',    fallback: '#614446', linear: ['#3E2D3F', '#8D645C'], scrim: 'rgba(0, 0, 0, 0.22)' },
    { slug: 'rich-bistre',    name: 'Rich Bistre',    group: 'dark',  file: 'rich-bistre.webp',    fallback: '#0E0805', linear: ['#3F2C20', '#060201'] }
  ];
  root.TABLET_BACKGROUNDS = BACKGROUNDS;
  if (typeof module !== 'undefined' && module.exports) module.exports = { TABLET_BACKGROUNDS: BACKGROUNDS };
})(typeof window !== 'undefined' ? window : globalThis);
