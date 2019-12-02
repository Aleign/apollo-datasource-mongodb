import { InMemoryLRUCache } from 'apollo-server-caching'
import wait from 'waait'
import sift from 'sift'
import { first } from 'lodash'

import { createCachingMethods } from '../cache'

const docs = [
  {
    _id: 'id1',
    id: 'id1'
  },
  {
    _id: 'id2',
    id: 'id2'
  },
  {
    _id: 'id3',
    id: 'id3'
  }
];

const getDoc = id => first(docs.filter(d => d.id === id));

const collectionName = 'test'
const cacheKey = id => `mongo-${collectionName}-${id}`

describe('createCachingMethods', () => {
  let collection
  let api
  let cache

  beforeEach(() => {
    collection = {
      collectionName,
      find: jest.fn(query => ({
        toArray: () =>
          new Promise(resolve => {
            setTimeout(() => resolve(docs.filter(sift(query))), 0)
          })
      }))
    }

    cache = new InMemoryLRUCache()

    api = createCachingMethods({ collection, cache })
  })

  it('adds the right methods', () => {
    expect(api.findOneById).toBeDefined()
    expect(api.findManyByIds).toBeDefined()
    expect(api.deleteFromCacheById).toBeDefined()
  })

  it('finds one', async () => {
    const doc = await api.findOneById('id1')
    expect(doc).toMatchObject(getDoc('id1'))
    expect(collection.find.mock.calls.length).toBe(1)
  })

  it('finds two with batching', async () => {
    const foundDocs = await api.findManyByIds(['id2', 'id3'])

    expect(foundDocs[0]).toMatchObject(getDoc('id2'))
    expect(foundDocs[1]).toMatchObject(getDoc('id3'))

    expect(collection.find.mock.calls.length).toBe(1)
  })

  it('finds one with query', async () => {
    const doc = await api.findOneByQuery({query: {_id: { $in: ['id1']}}});

    expect(doc).toMatchObject(getDoc('id1'))

    expect(collection.find.mock.calls.length).toBe(1)
  })

  it('finds two with query and batching', async () => {
    const foundDocs = await api.findByQuery({query: {_id: { $in: ['id2', 'id3']}}});

    expect(foundDocs[0]).toMatchObject(getDoc('id2'))
    expect(foundDocs[1]).toMatchObject(getDoc('id3'))

    expect(collection.find.mock.calls.length).toBe(1)
  })

  // TODO why doesn't this pass?
  // it.only(`doesn't cache without ttl`, async () => {
  //   await api.findOneById('id1')
  //   await api.findOneById('id1')

  //   expect(collection.find.mock.calls.length).toBe(2)
  // })

  it(`doesn't cache without ttl`, async () => {
    await api.findOneById('id1')

    const value = await cache.get(cacheKey('id1'))
    expect(value).toBeUndefined()
  })

  it(`caches`, async () => {
    await api.findOneById('id1', { ttl: 1 })
    const value = await cache.get(cacheKey('id1'))
    expect(value).toMatchObject(getDoc('id1'))

    await api.findOneById('id1')
    expect(collection.find.mock.calls.length).toBe(1)
  })

  it(`caches with ttl`, async () => {
    await api.findOneById('id1', { ttl: 1 })
    await wait(1001)

    const value = await cache.get(cacheKey('id1'))
    expect(value).toBeUndefined()
  })

  it(`deletes from cache`, async () => {
    await api.findOneById('id1', { ttl: 1 })

    const valueBefore = await cache.get(cacheKey('id1'))
    expect(valueBefore).toMatchObject(getDoc('id1'))

    await api.deleteFromCacheById('id1')

    const valueAfter = await cache.get(cacheKey('id1'))
    expect(valueAfter).toBeUndefined()
  })
})
