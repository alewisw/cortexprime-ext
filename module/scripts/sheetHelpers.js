import { getLength, objectReindexFilter } from '../../lib/helpers.js'
import { confirmAction, localizer } from './foundryHelpers.js'

export const addNewDataPoint = async function (data, path, value) {
  const currentData = data || {}

  await this.actor.update({
    [`data.${path}`]: {
      ...currentData,
      [getLength(currentData)]: value
    }
  })
}

export const resetDataPoint = async function (path, target, value) {
  await this.actor.update({
    [`${path}.-=${target}`]: null
  })

  await this.actor.update({
    [`${path}.${target}`]: value
  })
}

export const removeDataPoint = async function (data, path, target, key) {
  const currentData = data || {}

  const newData = objectReindexFilter(currentData, (_, currentKey) => parseInt(currentKey, 10) !== parseInt(key, 10))

  await resetDataPoint.call(this, path, target, newData)
}
