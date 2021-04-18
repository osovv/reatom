import { test } from 'uvu'
import * as assert from 'uvu/assert'

import {
  ActionCreator,
  createStore,
  createTransaction,
  declareAction,
  declareAtom,
  F,
  Store,
  Transaction,
} from '.'

let noop: F = () => {}

const sleep = (ms = 0) => new Promise(r => setTimeout(r, ms))

export function mockFn<I extends any[], O>(
  fn: F<I, O> = (...i: any) => void 0 as any,
) {
  const _fn = Object.assign(
    function(...i: I) {
      // @ts-ignore
      const o = fn.apply(this, i)

      _fn.calls.push({ i, o })

      return o
    },
    {
      calls: new Array<{ i: I; o: O }>(),
      lastInput(): I[0] {
        const { length } = _fn.calls
        if (length === 0) throw new TypeError(`Array is empty`)
        return _fn.calls[length - 1].i[0]
      },
    },
  )

  return _fn
}

test(`displayName`, () => {
  const setFirstName = declareAction<string>()
  const setFullName = declareAction<string>()
  const firstNameAtom = declareAtom(($, state = 'John') => {
    $(setFirstName.handle(name => (state = name)))
    $(setFullName.handle(fullName => (state = fullName.split(' ')[0])))
    return state
  })

  const lastNameAtom = declareAtom(($, state = 'Doe') => {
    $(setFullName.handle(fullName => (state = fullName.split(' ')[1])))
    return state
  })

  const isFirstNameShortAtom = declareAtom($ => $(firstNameAtom).length < 10)

  const fullNameAtom = declareAtom(
    $ => `${$(firstNameAtom)} ${$(lastNameAtom)}`,
  )

  const displayNameAtom = declareAtom($ =>
    $(isFirstNameShortAtom) ? $(fullNameAtom) : $(firstNameAtom),
  )

  const store = createStore()

  const cb = mockFn()
  store.subscribe(displayNameAtom, cb)

  assert.is(cb.calls.length, 1)
  assert.is(cb.lastInput(), 'John Doe')

  store.dispatch(setFirstName('John'))
  assert.is(cb.calls.length, 1)
  assert.is(cb.lastInput(), 'John Doe')

  store.dispatch(setFirstName('Joe'))
  assert.is(cb.calls.length, 2)
  assert.is(cb.lastInput(), 'Joe Doe')

  store.dispatch(setFirstName('Joooooooooooooooooooe'))
  assert.is(cb.calls.length, 3)
  assert.is(cb.lastInput(), 'Joooooooooooooooooooe')

  store.dispatch(setFirstName('Joooooooooooooooooooe'))
  assert.is(cb.calls.length, 3)
  assert.is(cb.lastInput(), 'Joooooooooooooooooooe')

  console.log(`👍`)
})

test(`combine`, () => {
  const aAtom = declareAtom(0)
  const bAtom = declareAtom($ => $(aAtom) % 2)
  const cAtom = declareAtom($ => $(aAtom) % 2)
  const bcAtom = declareAtom($ => ({
    b: $(bAtom),
    c: $(cAtom),
  }))
  const store = createStore()
  store.init(bcAtom)

  const bsState1 = store.getState(bcAtom)
  assert.is(store.getState(aAtom), 0)
  assert.equal(bsState1, { b: 0, c: 0 })

  store.dispatch(aAtom.update(s => s + 1))
  const bsState2 = store.getState(bcAtom)
  assert.is(store.getState(aAtom), 1)
  assert.equal(bsState2, { b: 1, c: 1 })

  store.dispatch(aAtom.update(s => s + 2))
  const bsState3 = store.getState(bcAtom)
  assert.is(store.getState(aAtom), 3)
  assert.equal(bsState3, { b: 1, c: 1 })
  assert.is(bsState2, bsState3)

  console.log(`👍`)
})

test(`atom id`, () => {
  const a = declareAtom(1, 'a')
  const b = declareAtom(2, ($, s) => s, 'b')
  const c = declareAtom(($, s = 3) => s, 'c')
  const store = createStore()

  store.init(a, b, c)

  assert.equal(store.getState(), { a: 1, b: 2, c: 3 })

  console.log(`👍`)
})

test(`action mapper`, () => {
  const action = declareAction((payload: number) => ({ payload: payload + 1 }))
  assert.is(action(1).payload, 2)

  console.log(`👍`)
})

test(`atom filter`, () => {
  const aAtom = declareAtom(0)
  const bAtom = declareAtom(0, ($, s) => {
    track()

    const a = $(aAtom)
    if (a % 2) s = a
    return s
  })
  const track = mockFn()

  const bCache1 = bAtom(createTransaction([]))
  assert.is(track.calls.length, 1)
  assert.is(bCache1.state, 0)

  const bCache2 = bAtom(createTransaction([]), bCache1)
  assert.is(track.calls.length, 1)
  assert.is(bCache1, bCache2)

  const bCache3 = bAtom(createTransaction([aAtom.update(0)]), bCache2)
  assert.is(track.calls.length, 1)
  assert.is.not(bCache2, bCache3)
  assert.is(bCache2.state, bCache3.state)

  const bCache4 = bAtom(createTransaction([aAtom.update(1)]), bCache3)
  assert.is(track.calls.length, 2)
  assert.is.not(bCache3, bCache4)
  assert.is.not(bCache3.state, bCache4.state)

  console.log(`👍`)
})

test(`in atom action effect`, async () => {
  function declareResource<I, O>(fetcher: (params: I) => Promise<O>) {
    const request = declareAction<I>()

    return Object.assign(
      declareAtom<null | O | Error>(null, ($, state, update) => {
        $(
          request.handleEffect(({ payload }, { dispatch }) =>
            fetcher(payload)
              .then(data => dispatch(update(data)))
              .catch(e =>
                dispatch(update(e instanceof Error ? e : new Error(e))),
              ),
          ),
        )
        return state
      }),
      { request },
    )
  }

  const dataAtom = declareResource((params: void) => Promise.resolve([]))
  const cb = mockFn()

  const store = createStore()

  store.subscribe(dataAtom, cb)
  assert.is(cb.calls.length, 1)
  assert.is(cb.lastInput(), null)

  store.dispatch(dataAtom.request())
  assert.is(cb.calls.length, 1)
  await sleep()
  assert.is(cb.calls.length, 2)
  assert.equal(cb.lastInput(), [])

  console.log(`👍`)
})

test(`action effect example`, () => {
  function handleEffects(store: Store) {
    store.subscribe(({ actions }) =>
      actions.forEach(action => action.effect?.(store)),
    )
  }

  const effect = mockFn()
  const doEffect = declareAction(() => ({ payload: null, effect }))
  const store = createStore()

  handleEffects(store)

  store.dispatch(doEffect())

  assert.is(effect.calls.length, 1)
  assert.is(effect.lastInput(), store)

  console.log(`👍`)
})

test(`Atom store dependency states`, () => {
  const aTrack = mockFn()
  const incrementA = declareAction()
  const noopAction = declareAction()
  const aAtom = declareAtom(($, state = 1) => {
    aTrack()
    $(incrementA.handle(() => (state += 1)))
    return state
  })
  const bAtom = declareAtom($ => $(aAtom) + 1)

  const bCache1 = bAtom(createTransaction([noopAction()]))
  assert.is(aTrack.calls.length, 1)

  const bCache2 = bAtom(createTransaction([noopAction()]), bCache1)
  assert.is(aTrack.calls.length, 1)
  assert.is(bCache1, bCache2)

  assert.is(bCache2.state, 2)
  const bCache3 = bAtom(createTransaction([incrementA()]), bCache1)
  assert.is(aTrack.calls.length, 2)
  assert.is(bCache3.state, 3)

  console.log(`👍`)
})

test(`Atom from`, () => {
  const atom = declareAtom(42)

  assert.is(atom(createTransaction([declareAction()()])).state, 42)
  assert.is(atom(createTransaction([atom.update(43)])).state, 43)
  assert.is(atom(createTransaction([atom.update(s => s + 2)])).state, 44)

  console.log(`👍`)
})

test(`Store preloaded state`, () => {
  const atom = declareAtom(42)
  const storeWithPreloadedState = createStore({ [atom.id]: 0 })
  const storeWithoutPreloadedState = createStore()

  assert.is(storeWithoutPreloadedState.getState(atom), 42)
  assert.is(storeWithPreloadedState.getState(atom), 0)

  storeWithoutPreloadedState.subscribe(atom, noop)
  storeWithPreloadedState.subscribe(atom, noop)

  assert.is(storeWithoutPreloadedState.getState(atom), 42)
  assert.is(storeWithPreloadedState.getState(atom), 0)

  storeWithoutPreloadedState.dispatch(atom.update(s => s + 1))
  storeWithPreloadedState.dispatch(atom.update(s => s + 1))

  assert.is(storeWithoutPreloadedState.getState(atom), 43)
  assert.is(storeWithPreloadedState.getState(atom), 1)

  console.log(`👍`)
})

test(`Batched dispatch`, () => {
  const atom = declareAtom(0)
  const store = createStore()
  const cb = mockFn()

  store.subscribe(atom, cb)

  assert.is(cb.calls.length, 1)

  store.dispatch([atom.update(s => s + 1), atom.update(s => s + 1)])
  assert.is(cb.calls.length, 2)
  assert.is(cb.lastInput(), 2)

  console.log(`👍`)
})

test(`Batched dispatch dynamic types change`, () => {
  let computerCalls = 0
  const doSome = declareAction<any>()
  const addAction = declareAction<ActionCreator>()
  const actionsCacheAtom = declareAtom(
    ($, state = new Array<readonly [ActionCreator, any]>()) => {
      computerCalls++
      $(
        addAction.handle(
          actionCreator => (state = [...state, [actionCreator, null]]),
        ),
      )

      return state.map(([actionCreator, payload = null]) => {
        $(actionCreator.handle(v => (payload = v)))
        return [actionCreator, payload] as const
      })
    },
  )
  const store = createStore()

  store.init(actionsCacheAtom)
  assert.is(computerCalls, 1)

  store.dispatch([addAction(doSome), doSome(0)])
  assert.equal(store.getState(actionsCacheAtom), [[doSome, 0]])
  assert.is(computerCalls, 2)

  console.log(`👍`)
})

test(`async collection of transaction.effectsResult`, async () => {
  function createEffectsTracker(store: Store, start = () => {}) {
    let unsubscribeFromAction: F | undefined
    const promise = new Promise<void>(res => {
      let effectsCount = 0

      store.subscribe(transaction => {
        unsubscribeFromAction = store.subscribe(
          declareAction(transaction.actions[0]!.type),
          () => {
            transaction.effectsResult!.forEach(some => {
              if (some instanceof Promise) {
                effectsCount++

                some.finally(() => --effectsCount === 0 && res())
              }
            })

            if (effectsCount === 0) res()
          },
        )
      })

      start()
    })

    unsubscribeFromAction?.()

    return promise
  }

  const doA = declareAction()
  const doB = declareAction()

  const resourceAtom = declareAtom(0, ($, state, update) => {
    $(
      doA.handleEffect(async (action, { dispatch }) => {
        await sleep(10)
        dispatch(doB())
      }),
    )
    $(
      doB.handleEffect(async (action, { dispatch }) => {
        await sleep(10)
        dispatch(update(s => s + 1))
      }),
    )
    return state
  })

  const store = createStore()
  const cb = mockFn()

  store.init(resourceAtom)

  createEffectsTracker(store, () => store.dispatch(doA())).then(cb)

  assert.is(cb.calls.length, 0)

  await sleep(10)

  assert.is(cb.calls.length, 0)

  await sleep(10)

  assert.is(cb.calls.length, 1)

  console.log(`👍`)
})

test(`declareResource`, async () => {
  let resourcesCount = 0
  function declareResource<State, Params = void>(
    initialState: State,
    fetcher: (params: Params) => Promise<State>,
    id = `resource [${++resourcesCount}]`,
  ) {
    const get = declareAction<Params>(`get of ${id}`)
    const req = declareAction<Params>(`req of ${id}`)
    const res = declareAction<State>(`res of ${id}`)
    const err = declareAction<Error>(`err of ${id}`)
    const rej = declareAction(`rej of ${id}`)

    const initTag = Symbol()
    const paramsAtom = declareAtom(($, state = initTag as unknown) => {
      $(req.handle(params => (state = params)))
      return state
    }, `params of ${id}`)
    const versionAtom = declareAtom(($, state = 0) => {
      $(req.handle(() => state++))
      $(rej.handle(() => state++))
      return state
    }, `version of ${id}`)

    const reqAtom = declareAtom(($, state = false) => {
      $(resourceAtom.req.handle(() => (state = true)))
      $(resourceAtom.res.handle(() => (state = false)))
      $(resourceAtom.err.handle(() => (state = false)))
      return state
    }, `req of ${id}`)

    const errAtom = declareAtom(($, state = null as null | Error) => {
      $(err.handle(e => (state = e)))
      $(res.handle(() => (state = null)))
      return state
    }, `err of ${id}`)

    const resourceAtom = Object.assign(
      declareAtom(($, state = initialState) => {
        const params = $(paramsAtom)
        const version = $(versionAtom)

        $(
          get.handleEffect(
            ({ payload }, { dispatch }) =>
              (params === initTag || payload !== params) &&
              dispatch(req(payload)),
          ),
        )

        $(
          req.handleEffect(({ payload }, { dispatch, getState }) =>
            fetcher(payload).then(
              data => getState(versionAtom) === version && dispatch(res(data)),
              error =>
                getState(versionAtom) === version &&
                dispatch(
                  err(error instanceof Error ? error : new Error(error)),
                ),
            ),
          ),
        )

        $(res.handle(data => (state = data)))

        return state
      }, id),
      {
        get,
        req,
        res,
        err,
        rej,
        reqAtom,
        errAtom,
      },
    )

    return resourceAtom
  }

  const resourceAtom = declareResource([0], (param: number) =>
    typeof param === 'number'
      ? Promise.resolve([param])
      : Promise.reject(new Error(param)),
  )
  resourceAtom.rej

  const store = createStore()
  const cb = mockFn()

  store.subscribe(resourceAtom, cb)
  assert.is(cb.calls.length, 1)
  assert.equal(cb.lastInput(), null)

  store.dispatch(resourceAtom.get(42))
  assert.is(cb.calls.length, 1)
  assert.equal(cb.lastInput(), null)
  await sleep()
  cb.lastInput() //?
  assert.is(cb.calls.length, 2)
  assert.equal(cb.lastInput(), [42])

  const state = store.getState(resourceAtom)
  store.dispatch(resourceAtom.get(42))
  assert.is(cb.calls.length, 2)
  assert.is(cb.lastInput(), state)
  await sleep()
  assert.is(cb.calls.length, 2)
  assert.is(cb.lastInput(), state)

  store.dispatch(resourceAtom.req(42))
  assert.is(cb.calls.length, 2)
  await sleep()
  assert.is(cb.calls.length, 3)
  assert.equal(cb.lastInput(), state)

  store.dispatch(resourceAtom.req('42' as any))
  assert.is(cb.calls.length, 3)
  await sleep()
  assert.is(cb.calls.length, 4)
  assert.equal(cb.lastInput(), new Error('42'))

  store.dispatch(resourceAtom.req(1))
  store.dispatch(resourceAtom.req(2))
  store.dispatch(resourceAtom.req(3))
  assert.is(cb.calls.length, 4)
  await sleep()
  assert.is(cb.calls.length, 5)
  assert.equal(cb.lastInput(), [3])

  console.log(`👍`)
})

test.run()
