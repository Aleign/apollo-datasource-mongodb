"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.idsToStrings = exports.getCollection = exports.isCollectionOrModel = exports.isModel = void 0;
const TYPEOF_COLLECTION = 'object';

const isModel = x => Boolean(x && x.name === 'model');

exports.isModel = isModel;

const isCollectionOrModel = x => Boolean(x && (typeof x === TYPEOF_COLLECTION || isModel(x)));

exports.isCollectionOrModel = isCollectionOrModel;

const getCollection = x => isModel(x) ? x.collection : x;

exports.getCollection = getCollection;

const idsToStrings = x => x.map(i => ({ ...i,
  id: i._id.toString() ? i._id.toString() : i._id
}));

exports.idsToStrings = idsToStrings;