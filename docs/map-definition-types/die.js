/**
 * @typedef {object} Die - die definition
 * @property {string} type - D6 | D12 | D20 and so on; basically D prefix with number of sides
 * @property {number} faceValue
 * @property {number} [stackIndex] - for tower definition; 0 is tower base, 1 is the die on top of the tower base and so on
 * @property {boolean} [isKing] - if true, the die will be used in "capture the king" win condition
 */
