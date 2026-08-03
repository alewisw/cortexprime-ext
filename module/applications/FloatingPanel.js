// Generic, pluggable top-center floating panel. Features register buttons into it via
// FloatingPanel.registerButton() rather than editing this file.
export class FloatingPanel extends Application {
  static buttons = []

  static registerButton ({ id, icon, tooltip, isActive, isEnabled, onClick }) {
    FloatingPanel.buttons = [
      ...FloatingPanel.buttons.filter(button => button.id !== id),
      { id, icon, tooltip, isActive, isEnabled, onClick }
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
    return {
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
  }

  refresh () {
    this.render(true)
  }
}
