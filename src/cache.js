import DataLoader from 'dataloader'
import { first } from 'lodash';
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

export const createCachingMethods = ({ collection, cache }) => {
  const loader = new DataLoader(async ids => {

    try {
      const items = await collection
        .find({ _id: { $in: ids } })
        .toArray()

      return idsToStrings(orderDocs(ids)(items));

    } catch(e) {
      throw e;
    }
  })


  const dataQuery = async ({ queries }) => {
    const { projection, select, lean, sort } = first(queries)

    try {
      let items = await collection.find({ $or: queries.map(({query}) => query) }, projection)
      // .select(select)
      // .sort(sortBy)
      // .lean()
      .toArray();

      items = idsToStrings(items);

      return queries.map(({query}) => items.filter(sift(query)));
    } catch(e) {
      throw e;
    }

  }

  const queryLoader = new DataLoader(queries => {
    return dataQuery({ queries })

  });

  const cachePrefix = `mongo-${getCollection(collection).collectionName}-`

  const methods = {
    findOneById: async (id, { ttl } = {}) => {
      const key = cachePrefix + id

      let doc;
      try {
        const cacheDoc = await cache.get(key)
        if (cacheDoc) {
          return cacheDoc
        }

        doc = await loader.load(id)
      } catch(e) {
        throw e;
      }

      if (Number.isInteger(ttl)) {
        // https://github.com/apollographql/apollo-server/tree/master/packages/apollo-server-caching#apollo-server-caching
        cache.set(key, doc, { ttl })
      }

      return doc;
    },
    findManyByIds: (ids, { ttl } = {}) => {
      return Promise.all(ids.map(id => methods.findOneById(id, { ttl })))
    },

    deleteFromCacheById: id => cache.delete(cachePrefix + id),
    // deleteFromCacheByQuery: query => cache.delete(cachePrefix + id),

    findByQuery: async (query) => {
      try {
        const docs = await queryLoader.load(query);
        docs.forEach(doc => loader.prime(doc._id.toString(), doc));
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


// function usersByQueryBatchLoadFn(queries) {
//   // The '$or' operator lets you combine multiple queries so that any record matching any of the queries gets returned
//   const users = await MongooseUserModel.find({ '$or': queries }).exec();
//
//   // You can prime other loaders as well
//   // Priming inserts the key into the cache of another loader
//   for (const user of users) {
//     userByIdLoader.prime(user.id.toString(), user);
//   }
//
//   // Sift.js applies the MongoDB query to the data to determine if it matches the query. We use this to assign the right users to the right query that requested it.
//   return queries.map(query => users.filter(sift(query)));
// };
