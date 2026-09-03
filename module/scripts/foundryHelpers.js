export const getBorderWidth = (borderPosition, borderWidth) => {
  switch (borderPosition) {
    case 'a':
      return `${borderWidth}px ${borderWidth}px ${borderWidth}px ${borderWidth}px`
    case 'b':
      return `0 0 ${borderWidth}px 0`
    case 'l':
      return `0 0 0 ${borderWidth}px`
    case 'r':
      return `0 ${borderWidth}px 0 0`
    case 't':
      return `${borderWidth}px 0 0 0`
    case 'x':
      return `0 ${borderWidth}px 0 ${borderWidth}px`
    case 'y':
      return `${borderWidth}px 0 ${borderWidth}px 0`
  }
}

export const localizer = target => game.i18n.localize(target)

// A world Setting is a Document like any other: the *first* time it's ever set (e.g. right
// after a world is created, before a GM has touched it) Foundry creates that Setting document
// and fires 'createSetting', not 'updateSetting' — every later change updates the existing
// document and fires 'updateSetting' as expected. Listening for only 'updateSetting' means a
// setting's very first change is silently missed. Use this instead of Hooks.on('updateSetting',
// ...) wherever a setting change should trigger a refresh, so both cases are covered.
//
// Returns a disposer that unregisters both hooks. Most callers register once at startup and
// listen for the life of the session, so they can ignore it — but anything scoped to something
// shorter-lived (a dialog, a temporarily open window) MUST call it when that thing goes away,
// or every open/close cycle leaves another listener behind holding its whole closure alive.
export const onSettingChanged = callback => {
  Hooks.on('createSetting', callback)
  Hooks.on('updateSetting', callback)

  return () => {
    Hooks.off('createSetting', callback)
    Hooks.off('updateSetting', callback)
  }
}

// Shows the Dice So Nice "plot point" die-flip animation (the cp-pp preset registered in
// cortexPrimeHooks.js), so every mechanism that moves a Plot Point reads the same visually —
// pass a count when a single action moves more than one point (e.g. multiple Roll & Select
// checkboxes, or several hitches resolved at once) so they appear together in one throw.
// Synchronized, so everyone at the table sees it, not just whoever triggered it.
export const showPlotPointAnimation = (count = 1) => {
  if (!game.dice3d || count < 1) return

  const dice = Array.from({ length: count }, () => ({ result: 1, resultLabel: 1, type: 'dp', vectors: [], options: {} }))

  game.dice3d.show({ throws: [{ dice }] }, game.user, true)
}

export const showPlotPointSpendAnimation = showPlotPointAnimation

// The notes-field pencil button (additional-tab.html, and its Settings-page default-content
// analogue) opens Foundry's own ProseMirror editor, which measures the CURRENT height of
// .editor-content before mounting - if the field has shrunk to fit short content (see
// .notes-field in _forms.scss), editing would open at that same shrunk height instead of
// expanding to the field's max. Force both to max height first, so Foundry's measurement (and
// the abs-positioned editor surface that then fills .editor's box once mounted) picks up the
// expanded size. Call this once per activateListeners, alongside the sheet's other listener
// wiring; it registers on the capture phase so it runs before Foundry's own button.onclick.
// Takes the root HTMLElement - appv1 callers pass html[0], ApplicationV2 ones this.element.
export const expandNotesFieldOnEdit = root => {
  root.addEventListener('click', event => {
    const button = event.target.closest('.notes-field .editor-edit')
    if (!button) return

    const notesField = button.closest('.notes-field')
    const editorContent = notesField.querySelector('.editor-content')
    const maxHeight = getComputedStyle(notesField).maxHeight

    notesField.style.height = maxHeight
    if (editorContent) editorContent.style.height = maxHeight
  }, true)
}

const PX_KEYS = [
  'bodyFontSize',
  'descriptorLabelFontSize',
  'inputBorderWidth',
  'inputLabelFontSize',
  'sectionBorderWidth',
  'sectionPrimaryTitleFontSize',
  'sectionSecondaryTitleFontSize',
  'separatorWeight',
  'sfxLabelFontSize',
  'subTraitLabelFontSize',
  'traitSubTitleFontSize',
  'traitTitleFontSize'
]

const IMAGE_KEYS = ['sheetBackgroundImage', 'sectionBackgroundImage']

// Pure: the theme -> CSS custom property transform, as [property, value] pairs. Split out from
// setCssVars below (whose only other job is writing them onto document.body) so the value
// rules — px suffixes, url() wrapping, camelCase -> --cp-kebab-case — are unit testable.
export const computeCssVars = (theme) =>
  Object.entries(theme).map(([ key, value ]) => {
    if ('inputBorderPosition' === key) {
      value = getBorderWidth(value, theme.inputBorderWidth)
    }

    if ('sectionBorderPosition' === key) {
      value = getBorderWidth(value, theme.sectionBorderWidth)
    }

    if (PX_KEYS.includes(key)) {
      value = `${value}px`
    }

    if (IMAGE_KEYS.includes(key)) {
      value = value
        ? value.startsWith('http')
          ? `url('${value}')`
          : `url('/${value}')`
        : 'none'
    }

    const property = `--cp-${key.replace(/[A-Z]+(?![a-z])|[A-Z]/g, ($, ofs) => (ofs ? "-" : "") + $.toLowerCase())}`

    return [property, value]
  })

export const setCssVars = (theme) => {
  computeCssVars(theme).forEach(([ property, value ]) => {
    document.body.style.setProperty(property, value)
  })
}

// The active theme: either the hand-tuned 'custom' one or the named preset currently selected.
// This lookup was copy-pasted at a dozen call sites; it lives here so the "what is 'custom'"
// rule is stated once. ThemeSettings writes the setting and then reads it straight back through
// this, so it must stay a live read rather than anything cached.
export const getCurrentTheme = () => {
  const themes = game.settings.get('cortexprime-ext', 'themes')

  return themes.current === 'custom' ? themes.custom : themes.list[themes.current]
}

// The first open Application matching `predicate`, across BOTH registries. Application V1 windows
// live in ui.windows; V2 ones live in foundry.applications.instances and never appear in
// ui.windows at all. During the V1 -> V2 migration both are populated, so anything looking up a
// live window by identity has to check both or it will silently stop finding apps the moment they
// move. Use this rather than reaching into either registry directly.
export const findApp = predicate => [
  ...Object.values(ui.windows ?? {}),
  ...(foundry.applications?.instances?.values() ?? [])
].find(predicate) ?? null

// A yes/no confirmation, resolving true only when the user actively confirms.
//
// Replaces the appv1 `Dialog.confirm({ yes, no, defaultYes })` shape, which this system used
// identically in eight places: declare a `confirmed` flag, let the callbacks assign it, then read
// it back. DialogV2.confirm returns the answer directly and defaults to No, so all of that
// collapses to this. Dismissing the window (Escape, or the X) resolves null rather than throwing,
// which counts as "no" exactly as the old undefined-flag did.
//
// DialogV2 is referenced inside the function body, not at module scope, so this file stays
// importable under unit test where the Foundry globals are absent.
export const confirmAction = async ({ title, content }) =>
  await foundry.applications.api.DialogV2.confirm({
    window: { title: title ?? localizer('AreYouSure') },
    content
  }) === true

// Content for a DialogV2 that must keep inline SVG.
//
// DialogV2 runs foundry.utils.cleanHTML() over a STRING `content`, and Foundry's allowed-tag list
// (CONST.ALLOWED_HTML_TAGS, 90 entries) includes neither <svg> nor <path>. Every die shape in a
// dialog is therefore stripped out silently, leaving the number floating on no background - which
// is what happened to the Select Your Dice picker and the consumable-dice picker when they moved
// off appv1's Dialog, since that one did no sanitising at all.
//
// An attribute-less <div> is the documented way round it: DialogV2 takes such an element's
// innerHTML as-is and skips cleaning (see its _initializeApplicationOptions, which throws if the
// element is not a DIV or carries any attributes).
//
// Only for the system's own rendered templates. Anything user-supplied should keep going through
// the string path so it stays sanitised.
export const dialogContent = html => {
  const element = document.createElement('div')

  element.innerHTML = html

  return element
}
