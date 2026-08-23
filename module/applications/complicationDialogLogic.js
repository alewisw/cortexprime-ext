import { SEVERITIES, getCategories, getPresetNames, getSubCategories } from '../actor/complicationPresets.js'

// Resolves whatever category/subCategory the dialog currently has selected against the preset
// library, falling back to "the first of each" so the picker is always showing something valid -
// e.g. switching category away from one whose subCategory doesn't exist anywhere else. All three
// severities are returned side by side (as columns), rather than the dialog picking one severity
// to filter by, so a name can be selected from whichever column without an extra click.
export const buildPickerState = ({ category, subCategory, selectedName } = {}) => {
  const categories = getCategories()
  const selectedCategory = categories.includes(category) ? category : categories[0]

  const subCategories = getSubCategories(selectedCategory)
  const selectedSubCategory = subCategories.includes(subCategory) ? subCategory : subCategories[0]

  return {
    categories: categories.map(value => ({ value, selected: value === selectedCategory })),
    subCategory: {
      options: subCategories.map(value => ({ value, selected: value === selectedSubCategory })),
      selected: selectedSubCategory
    },
    severities: SEVERITIES.map(severity => ({
      severity,
      // label is the exact lang key for this severity (Mild/Moderate/Severe) - the template
      // localizes it directly rather than needing a capitalize Handlebars helper.
      label: severity.charAt(0).toUpperCase() + severity.slice(1),
      names: getPresetNames(selectedCategory, selectedSubCategory, severity).map(name => ({
        name,
        selected: name === selectedName
      }))
    }))
  }
}

// The shape a complication's dice.value takes for a single die of the given face count.
export const toDiceValue = faces => ({ 0: String(faces) })
