import { CortexApplicationV2 } from './CortexApplicationV2.js'

// Generic, pluggable top-center floating panel. Features register buttons into it via
// FloatingPanel.registerButton() rather than editing this file.
export class FloatingPanel extends CortexApplicationV2 {
  static buttons = []
  static widgets = []

  static registerButton ({ id, icon, tooltip, isActive, isEnabled, isVisible, onClick }) {
    FloatingPanel.buttons = [
      ...FloatingPanel.buttons.filter(button => button.id !== id),
      { id, icon, tooltip, isActive, isEnabled, isVisible, onClick }
    ]
  }

  // `activateListeners` receives the widget's own container as an HTMLElement (it was a jQuery
  // object before the V2 migration), or is not called at all when the widget rendered nothing.
  static registerWidget ({ id, template, getContext, activateListeners }) {
    FloatingPanel.widgets = [
      ...FloatingPanel.widgets.filter(widget => widget.id !== id),
      { id, template, getContext, activateListeners }
    ]
  }

  static DEFAULT_OPTIONS = {
    id: 'cortexprime-floating-panel',
    classes: ['floating-panel'],
    // frame:false replaces V1's popOut:false - no window chrome, no header, no close button.
    // positioned:false stops ApplicationV2 writing inline top/left, which would fight the fixed,
    // centred placement _floating-panel.scss gives #cortexprime-floating-panel.
    window: { frame: false, positioned: false }
  }

  // root:true because the template emits a flat run of siblings - one div per widget, one button
  // per registered button - rather than a single wrapper. HandlebarsApplicationMixin otherwise
  // rejects a part with more than one top-level element; with it, the children are placed directly
  // into the panel root, which is what the flex layout in _floating-panel.scss expects. A wrapper
  // would have worked only by neutralising it with display:contents.
  static PARTS = {
    content: { root: true, template: 'systems/cortexprime-ext/templates/floating-panel.html' }
  }

  async _prepareContext (options) {
    const renderedWidgets = await Promise.all(FloatingPanel.widgets.map(async widget => ({
      id: widget.id,
      html: (await foundry.applications.handlebars.renderTemplate(widget.template, await widget.getContext())).trim()
    })))

    const widgets = renderedWidgets.filter(widget => widget.html)

    return {
      ...await super._prepareContext(options),
      widgets,
      buttons: FloatingPanel.buttons
        .filter(button => button.isVisible ? button.isVisible() : true)
        .map(button => ({
          id: button.id,
          icon: button.icon,
          tooltip: typeof button.tooltip === 'function' ? button.tooltip() : button.tooltip,
          active: button.isActive ? !!button.isActive() : false,
          enabled: button.isEnabled ? !!button.isEnabled() : true
        }))
    }
  }

  _onRender (context, options) {
    super._onRender(context, options)

    FloatingPanel.widgets.forEach(widget => {
      if (!widget.activateListeners) return

      // A widget whose getContext produced nothing is filtered out of the render entirely, so its
      // container is absent. jQuery absorbed that silently; querySelector returns null, so skip.
      const element = this.element.querySelector(`[data-widget="${widget.id}"]`)

      if (element) widget.activateListeners(element)
    })
  }

  // The panel's buttons are registered at runtime by feature modules, so their action names are
  // not knowable when DEFAULT_OPTIONS.actions is evaluated. ApplicationV2 routes any data-action
  // it has no static handler for to this method, which is exactly the dynamic-dispatch hook.
  //
  // Note the reserved names: ApplicationV2 handles data-action="close", "tab" and
  // "toggleControls" itself, before this is ever reached, so no registered button may use them.
  async _onClickAction (event, target) {
    // Actions dispatch from contextmenu as well as click; V1 bound click alone, so ignore the
    // rest rather than firing a button's onClick on right-click.
    if (event.button !== 0) return

    event.preventDefault()

    const button = FloatingPanel.buttons.find(({ id }) => id === target.dataset.action)

    if (button?.onClick) await button.onClick()
  }

  refresh () {
    this.render(true)
  }
}
