// The actor sheet's content is zoomed by the theme's Sheet Scale (a percentage - see
// --cp-sheet-scale in _theme.scss), so its default window width is scaled to match; otherwise a
// shrunk sheet would reflow into a window still sized for 100%. A missing, empty or non-numeric
// scale (a theme saved before the setting existed, or a cleared input) counts as 100.
export const scaledSheetWidth = (baseWidth, sheetScale) =>
  Math.round(baseWidth * ((Number(sheetScale) || 100) / 100))
