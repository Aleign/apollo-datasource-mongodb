const TYPEOF_COLLECTION = 'object'

export const isModel = x => Boolean(x && x.name === 'model')

export const isCollectionOrModel = x =>
  Boolean(x && (typeof x === TYPEOF_COLLECTION || isModel(x)))

export const getCollection = x => (isModel(x) ? x.collection : x)

export const idsToStrings = ({ items, lean }) => items.map(item => {

  item.id = item._id.toString() ? item._id.toString() : item._id;
  return item;
});
