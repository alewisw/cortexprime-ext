// Generic, pluggable top-center floating panel. Features register buttons into it via
// FloatingPanel.registerButton() rather than editing this file.
export class FloatingPanel extends Application {
  static buttons = []
  static widgets = []

  static registerButton ({ id, icon, tooltip, isActive, isEnabled, onClick }) {
    FloatingPanel.buttons = [
      ...FloatingPanel.buttons.filter(button => button.id !== id),
      { id, icon, tooltip, isActive, isEnabled, onClick }
    ]
  }

  static registerWidget ({ id, template, getContext, activateListeners }) {
    FloatingPanel.widgets = [
      ...FloatingPanel.widgets.filter(widget => widget.id !== id),
      { id, template, getContext, activateListeners }
    ]
  }

  static get defaultOptions () {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'cortexprime-floating-panel',
      template: 'systems/cortexprime/templates/floating-panel.html',
      classes: ['cortexprime', 'floating-panel'],
      popOut: false
    })
  }

  async getData () {
    const renderedWidgets = await Promise.all(FloatingPanel.widgets.map(async widget => ({
      id: widget.id,
      html: (await foundry.applications.handlebars.renderTemplate(widget.template, await widget.getContext())).trim()
    })))

    const widgets = renderedWidgets.filter(widget => widget.html)

    return {
      widgets,
      buttons: FloatingPanel.buttons.map(button => ({
        id: button.id,
        icon: button.icon,
        tooltip: typeof button.tooltip === 'function' ? button.tooltip() : button.tooltip,
        active: button.isActive ? !!button.isActive() : false,
        enabled: button.isEnabled ? !!button.isEnabled() : true
      }))
    }
  }

  activateListeners (html) {
    super.activateListeners(html)

    html.find('[data-action]').click(async event => {
      event.preventDefault()
      const { action } = event.currentTarget.dataset
      const button = FloatingPanel.buttons.find(({ id }) => id === action)

      if (button && button.onClick) {
        await button.onClick()
      }
    })

    FloatingPanel.widgets.forEach(widget => {
      if (widget.activateListeners) {
        widget.activateListeners(html.find(`[data-widget="${widget.id}"]`))
      }
    })
  }

  refresh () {
    this.render(true)
  }
}
