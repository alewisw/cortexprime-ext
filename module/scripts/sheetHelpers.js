import { objectReindexFilter } from '../../lib/helpers.js'
import { confirmAction, localizer } from './foundryHelpers.js'
import { replaceAt } from './documentUpdateLogic.js'

// One replacing update - see replaceAt (documentUpdateLogic.js) for why not unset-then-set.
export const resetDataPoint = async function (path, target, value) {
  await this.actor.update(replaceAt(path, { [target]: value }))
}

export const removeDataPoint = async function (data, path, target, key) {
  const currentData = data || {}

  const newData = objectReindexFilter(currentData, (_, currentKey) => parseInt(currentKey, 10) !== parseInt(key, 10))

  await resetDataPoint.call(this, path, target, newData)
}
