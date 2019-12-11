import DataLoader from 'dataloader'
import { first, last, uniqBy, uniq, mergeWith, isArray, union, flatten } from 'lodash';
import sift from 'sift'
import { getCollection, idsToStrings } from './helpers'
// https://github.com/graphql/dataloader#batch-function


const orderDocs = ids => docs => {
  const idMap = {}
  docs.forEach(doc => {
    idMap[doc._id] = doc
  })
  return ids.map(id => idMap[id])
}

export const createCachingMethods = ({ model, collection, cache }) => {
  const loader = new DataLoader(async queries => {

    const select = uniq(flatten(queries.map(q => q.select ? q.select.split(' ') : [] ))).join(' ');

    const ids = queries.map(q => q.id);

    try {
      let items = await model
        .find({ _id: { $in: uniq(ids) } })
        .select(select)
        .lean()

      return idsToStrings({items: orderDocs(ids)(items)});

    } catch(e) {
      throw e;
    }
  }, {cache: false})

  const dataQuery = async ({ queries }) => {

    const select = uniq(flatten(queries.map(q => q.select ? q.select.split(' ') : [] ))).join(' ');

    // const uniqueQueries = mergeWith({}, uniqBy({ query }, JSON.stringify);

    const query = mergeWith({}, ...queries.map(q => q.query), (objValue, srcValue) => {
      if (isArray(objValue)) {
        return uniqBy(union(srcValue, objValue), id => id.toString() ? id.toString() : id);
      }
    });

    const projection = mergeWith({}, ...queries.map(q => q.projection), (objValue, srcValue) => {
      if (isArray(objValue)) {
        return [first(srcValue), uniqBy(union(last(srcValue), last(objValue)), id => id.toString() ? id.toString() : id)];
      }
    })

    let items;
    try {
      if (projection.$project) {
        items = await model.aggregate([
          { $match: query },
          { ...projection }
        ]);
      } else {
        items = await model.find(query, projection)
        .select(select)
        .lean()
      }

      items = idsToStrings({items});

      return queries.map(({query}) => items.filter(sift(query)));
    } catch(e) {
      throw e;
    }

  }

  const queryLoader = new DataLoader(async queries => {
    return dataQuery({ queries })

  }, {cache: false, cacheKeyFn: params => params.key});

  const cachePrefix = `mongo-${getCollection(collection).collectionName}-`

  const methods = {
    findOneById: async (params) => {
      const key = cachePrefix + params.id

      let doc;
      try {
        const cacheDoc = await cache.get(key)
        if (cacheDoc) {
          return cacheDoc
        }

        doc = await loader.load(params)
      } catch(e) {
        throw e;
      }

      if (Number.isInteger(params.ttl)) {
        // https://github.com/apollographql/apollo-server/tree/master/packages/apollo-server-caching#apollo-server-caching
        cache.set(key, doc, { ttl: params.ttl })
      }

      return doc;
    },
    findManyByIds: async (params) => {
      return Promise.all(params.ids.map(id => methods.findOneById({id, ...params})))
    },

    deleteFromCacheById: id => cache.delete(cachePrefix + id),
    // deleteFromCacheByQuery: query => cache.delete(cachePrefix + id),

    findByQuery: async (query) => {
      try {
        const docs = await queryLoader.load(query);
        docs.forEach(doc => loader.prime(query.key, doc));
        return docs
      } catch(e) {
        throw e;
      }
    },

    findOneByQuery: async (query) => {
      try {
        const docs = await methods.findByQuery(query);
        return first(docs);
      } catch(e) {
        throw e;
      }
    }

  }

  return methods
}
