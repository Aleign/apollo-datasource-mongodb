"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createCachingMethods = void 0;

var _dataloader = _interopRequireDefault(require("dataloader"));

var _lodash = require("lodash");

var _sift = _interopRequireDefault(require("sift"));

var _helpers = require("./helpers");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const orderDocs = ids => docs => {
  const idMap = {};
  docs.forEach(doc => {
    idMap[doc._id] = doc;
  });
  return ids.map(id => idMap[id]);
};

const createCachingMethods = ({
  collection,
  cache
}) => {
  const loader = new _dataloader.default(async ids => {
    try {
      const items = await collection.find({
        _id: {
          $in: ids
        }
      }).toArray();
      return (0, _helpers.idsToStrings)(orderDocs(ids)(items));
    } catch (e) {
      throw e;
    }
  });

  const dataQuery = async ({
    queries
  }) => {
    const {
      projection,
      select,
      lean,
      sort
    } = (0, _lodash.first)(queries);

    try {
      let items = await collection.find({
        $or: queries.map(({
          query
        }) => query)
      }, projection) // .select(select)
      // .sort(sortBy)
      // .lean()
      .toArray();
      items = (0, _helpers.idsToStrings)(items);
      return queries.map(({
        query
      }) => items.filter((0, _sift.default)(query)));
    } catch (e) {
      throw e;
    }
  };

  const queryLoader = new _dataloader.default(queries => {
    return dataQuery({
      queries
    });
  });
  const cachePrefix = `mongo-${(0, _helpers.getCollection)(collection).collectionName}-`;
  const methods = {
    findOneById: async (id, {
      ttl
    } = {}) => {
      const key = cachePrefix + id;
      let doc;

      try {
        const cacheDoc = await cache.get(key);

        if (cacheDoc) {
          return cacheDoc;
        }

        doc = await loader.load(id);
      } catch (e) {
        throw e;
      }

      if (Number.isInteger(ttl)) {
        // https://github.com/apollographql/apollo-server/tree/master/packages/apollo-server-caching#apollo-server-caching
        cache.set(key, doc, {
          ttl
        });
      }

      return doc;
    },
    findManyByIds: (ids, {
      ttl
    } = {}) => {
      return Promise.all(ids.map(id => methods.findOneById(id, {
        ttl
      })));
    },
    deleteFromCacheById: id => cache.delete(cachePrefix + id),
    // deleteFromCacheByQuery: query => cache.delete(cachePrefix + id),
    findByQuery: async query => {
      try {
        const docs = await queryLoader.load(query);
        docs.forEach(doc => loader.prime(doc._id.toString(), doc));
        return docs;
      } catch (e) {
        throw e;
      }
    },
    findOneByQuery: async query => {
      try {
        const docs = await methods.findByQuery(query);
        return (0, _lodash.first)(docs);
      } catch (e) {
        throw e;
      }
    }
  };
  return methods;
}; // function usersByQueryBatchLoadFn(queries) {
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


exports.createCachingMethods = createCachingMethods;