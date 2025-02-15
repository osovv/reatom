A set of operators to transform actions payload or an atoms state in a FRP style. Simply put, this package is convenient for reactive processing of actions and effects. But some operators could be useful for data processing too, like `filter`, `delay` (`debounce`, `throttle`) and `sample`.

> included in [@reatom/framework](https://www.reatom.dev/package/framework)

## `mapState`

Simple map utility, which allow you to receive previous dependency state by a second optional argument.

```ts
import { mapState } from '@reatom/lens'

// this is a typical code which have a problem with extra updates
// in case when an element of the list changes not `myProp`
export const filteredListAtom = atom((ctx) =>
  ctx.spy(listAtom).map((obj) => obj.myProp),
)
// `mapState` could help to solve this problem, as it pass previous state as a second argument
export const bAtom = listAtom.pipe(
  mapState((ctx, list, prevState) => {
    const newState = list.map((obj) => obj.myProp)
    return isShallowEqual(newState, prevState) ? prevState : newState
  }),
)
```

## `filter`

Sometimes you already have `filteredListAtom` from the previous example and it have no internal memoization. So you could use `filter` operator to prevent extra updates.

Updates filtered by comparator function, which should return `true`, if new state should continue to propagate. It uses `isShallowEqual` from utils package by default.

```ts
import { filter } from '@reatom/lens'
import { isShallowEqual } from '@reatom/utils'

export const listMemoAtom = filteredListAtom.pipe(filter())
// equals to
export const listMemoAtom = filteredListAtom.pipe(
  filter((ctx, next, prev) => !isShallowEqual(next, prev)),
)
```

This operator could filter actions too!

```ts
import { filter } from '@reatom/lens'

export const linkClicked = onDocumentClick.pipe(
  filter((ctx, event) => event.target.tagName === 'A'),
)
```

## `mapPayload`

Map payload of each action call. Resulted action is not callable.

```ts
import { mapPayload } from '@reatom/lens'

export const changeFullname = changeName.pipe(
  mapPayload((ctx, { firstName, lastName }) => `${firstName} ${lastName}`),
)
```

You could pass initial state by first argument to create an atom.

```ts
import { action } from '@reatom/core'
import { mapPayload } from '@reatom/lens'

export const onInput = action('onInput')
export const inputAtom = onInput.pipe(
  mapPayload('', (ctx, event) => event.currentTarget.value, 'inputAtom'),
)
```

## `mapPayloadAwaited`

Map fulfilled value of async action call. Resulted action is not callable.

```ts
import { mapPayloadAwaited } from '@reatom/lens'

export const newData = fetchData.pipe(mapPayloadAwaited())
// OR pick needed value
export const newData = fetchData.pipe(
  mapPayloadAwaited((ctx, response) => response.data),
)
```

You could pass initial state by first argument to create an atom.

```ts
import { mapPayloadAwaited } from '@reatom/lens'

export const dataAtom = fetchList.pipe(
  [],
  mapPayloadAwaited((ctx, response) => response.data),
  'dataAtom',
)
```

## `mapInput`

Create action which map input to passed action / atom.

```ts
import { atom } from '@reatom/core'
import { mapInput } from '@reatom/lens'

export const inputAtom = atom('', 'inputAtom')
export const changeInput = inputAtom.pipe(
  mapInput((ctx, event) => event.currentTarget.value, 'changeInput'),
)
```

## `debounce`

Delay updates by timeout.

```ts
import { action } from '@reatom/core'
import { debounce, mapPayload } from '@reatom/lens'

export const startAnimation = action()
export const endAnimation = startAnimation.pipe(debounce(250))
```

## `sample`

Delay updates until other atom update / action call.

> This code is taken from [this example](https://codesandbox.io/s/reatomasync-9t0x42?file=/src/model.ts).

```ts
import { mapPayload, sample } from '@reatom/lens'

export const lastRequestTimeAtom = fetchData.pipe(
  mapPayload(0, () => Date.now(), 'fetchStartAtom'),
  sample(fetchData.onSettle),
  mapState((ctx, start) => start && Date.now() - start, 'lastRequestTimeAtom'),
)
```

## `toAtom`

Convert an action to atom with optional init state.

```ts
import { mapPayloadAwaited, toAtom } from '@reatom/lens'

export const dataAtom = fetchData.pipe(mapPayloadAwaited(), toAtom([]))
```

## `plain`

Removes all extra properties, useful for exports cleaning.

```ts
import { plain } from '@reatom/lens'

const _fetchData = reatomFetch('...')

// ... some module logic with `_fetchData.retry` etc

// allow external modules only fetch data and not manage it by other ways
export const fetchData = _fetchData.pipe(plain)
```

## `readonly`

Removes all callable signature, useful for exports cleaning.

```ts
import { readonly } from '@reatom/lens'

const _countAtom = atom(0)
export const changeCount = action((ctx) => {
  // the module extra logic here
  _countAtom(ctx)
})

// disallow atom to be mutated outside the module
export const countAtom = _countAtom.pipe(readonly)
```

## `parseAtoms`

Recursively unwrap all atoms in an [atomized](https://www.reatom.dev/recipes/atomization) structure. Useful for making snapshots of reactive state. Uses `ctx.spy` if it's available.

### `parseAtoms`: persistence example

https://codesandbox.io/s/reatom-react-atomization-k39vrs?file=/src/model.ts

```ts
import { action, atom, Action, AtomMut } from '@reatom/core'
import { withLocalStorage } from '@reatom/persist-web-storage'
import { parseAtoms, ParseAtoms } from '@reatom/lens'

export type Field = {
  id: number
  name: string
  value: AtomMut<string>
  remove: Action
}

const getField = (id: number, name: string, value: string): Field => {
  return {
    id,
    name,
    value: atom(value),
    remove: action((ctx) => {
      // ...
    }),
  }
}

export const listAtom = atom<Array<Field>>([], 'listAtom').pipe(
  withLocalStorage({
    toSnapshot: (state) => parseAtoms(state),
    fromSnapshot: (snapshot: any) =>
      getField(snapshot.id, snapshot.name, snapshot.value),
  }),
)
```

### `parseAtoms`: shortcut example

You can use `parseAtoms` to reduce the amount of . Let's suppose you have the following structure:

```ts
interface User {
  name: AtomMut<string>
  bio: AtomMut<string>
  website: AtomMut<string>
  address: AtomMut<string>
}
```

And use it like this:

```tsx
import { useAtom } from '@reatom/npm-react'

export const User = ({ user }: { user: User }) => {
  const [name] = useAtom(user.name)
  const [bio] = useAtom(user.bio)
  const [website] = useAtom(user.website)
  const [address] = useAtom(user.address)

  return <form>...</form>
}
```

With `parseAtoms` you can refactor usage to look like this:

```tsx
import { parseAtoms } from '@reatom/lens'
import { useAtom, useAction } from '@reatom/npm-react'

export const User = ({ user }: { user: User }) => {
  const [
    {
      name, //
      bio,
      website,
      address,
    },
  ] = useAtom((ctx) => parseAtoms(ctx, user))

  return <form>...</form>
}
```

## `match`

Creates an atom that depending on some condition or data patterns, which can be an atom too. Useful for describing UIs with [`@reatom/jsx`](https://www.reatom.dev/package/jsx) or any other renderers. Here is the example of routing description from [the base template](https://github.com/artalar/reatom-react-ts) (Vite, TypeScript, React, Reatom).

```ts
export const routes = match(isLoggedAtom)
  .default(() => <Auth />)
  .truthy(
    match((ctx) => ctx.spy(urlAtom).pathname)
      .is('/me', () => <Profile />)
      .default(() => <Home />),
  )
```

You can call `match` with any primitive value, computed function, or existing atom. The returned atom depends on the initial expression and contains the `undefined` state by default. To add handlers and complete the state type, use chain methods. Each chain mutates the original atoms. It is a good practice to use it in the same place where atom was created.

- `default` for replacing `undefined` fallback state
- `is` for strict comparison
- `truthy` ([MDN](https://developer.mozilla.org/en-US/docs/Glossary/Truthy)) and `falsy` ([MDN](https://developer.mozilla.org/en-US/docs/Glossary/Falsy)) for empty things handling
- `with` structural handling

## `bind`

Bind action or atom update function with passed callback.

```ts
import { action, createCtx } from '@reatom/core'
import { bind } from '@reatom/lens'

const doSome = action()
const ctx = createCtx()

export handleSome = bind(ctx, doSome)

handleSome(123)
// 123
```

## `withReset`

Adds `reset` action to reset the atom state.

For example, clear state after all dependencies and subscribers are gone.

```ts
import { atom } from '@reatom/core'
import { withReset } from '@reatom/lens'
import { onDisconnect } from '@reatom/hooks'

export const dataAtom = atom([], 'dataAtom').pipe(withReset())
onDisconnect(dataAtom, dataAtom.reset)
```

## `select`

Sometimes you need to get computed value from an atom in another atom, but you don't want to trigger the whole computed function, as it could contain other computations. It is the common case for `reatomComponent` from [reatom/npm-react](https://www.reatom.dev/package/npm-react/) package. The `select` allows you to perform and memorize some computation by a simple inline callback. It is specially useful when you can't create separate memorized function because your target atom is dynamically created.

```tsx
import { select } from '@reatom/framework'
import { reatomComponent } from '@reatom/npm-react'

export const ListSum = reatomComponent(({ ctx }) => {
  // Simple call of `ctx.spy(listAtom).length` will cause extra rerenders for elements sorting or it internal changes.

  // correct optimal way, the component will rerender only on `length` change
  const length = select(ctx, (selectCtx) => selectCtx.spy(listAtom).length)
  // you could call `select` many times
  const sum = select(ctx, (selectCtx) =>
    selectCtx
      .spy(listAtom)
      .reduce((acc, el) => acc + selectCtx.spy(el.value), 0),
  )

  return (
    <div>
      The sum of {length} elements is: {sum}
    </div>
  )
}, 'ListSum')
```

Under the hood `select` creates additional atom, so you can perform all regular tasks in the callback of the `select`, just like in the regular computed atom.

Note for a rare cases. A created atom is momorized for the each select by the passed function sources from "toString()" method, so every computed callback in different selects of the same atom should contains differen code. This will throw an error, as the select called multiple times in the same atom with the same string represantation of the passed callback:

```ts
const sumAtom = atom((ctx) =>
  ctx
    .spy(listAtom)
    .reduce((acc, el) => acc + select(ctx, (ctx) => ctx.spy(el).value), 0),
)
```
