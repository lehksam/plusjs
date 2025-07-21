let templateCount = 0
export let templateToState = {}
export let stateMode

export class State {
  owningValue
  valueKey
  transformations = []
  owningState = this
  stateKey
  type
  listItemBlueprint
  fnArgs
  childStates = {}
  constructor(initialValue, placeholderValue, asRaw) {
    if (typeof initialValue === 'function' && !asRaw) {
      this.owningValue = registerClosure(initialValue, { name: 'state', state: this })
      if (isPromise(this.owningValue)) {
        this.owningValue = placeholderValue
      }
    }
    else this.owningValue = initialValue
  }
  getType() {
    return this.type
  }
  isRoot() {
    return typeof this.owningValue !== 'object' || !this.valueKey
  }
  toDOM(el) {
    if (this.type !== 'component') return null
    let hydrateChild = (root) => {
      const attribs = Array.from(root.attributes).map(i => i.name)
      const onHandlers = attribs.filter(i => i.startsWith('on'))
      onHandlers.forEach(i => {
        let attrValue = root.attributes[i].value
        if (attrValue[0] === ':') {
          let dash = attrValue.indexOf('-')
          const state = templateToState[attrValue.slice(1, dash)]
          const argIdx = attrValue.slice(dash + 1)
          const event = i.slice(2)
          let handler = state.getFunction(argIdx)
          root.addEventListener(event, handler)
          state.getTransformations().push({
            name: 'event',
            node: root,
            event,
            currentHandler: handler,
            state,
            argIdx
          })
          root.removeAttribute(i)
        }
      })

      for (let i = 0; i < root.childNodes.length; i++) {
        let child = root.childNodes[i]
        if (child.nodeType === 1) {
          hydrateChild(child)
        }
        else if (child.nodeType === 8 && child.nodeValue.startsWith('m-s')) {
          let state = templateToState[child.nodeValue.slice(3)]
          let nodeState = 'string'
          let contentNodeCount = 1
          let stateValue = state.get()
          while (stateValue instanceof State) {
            state.getTransformations().push({
              name: 'template',
              node: child,
              nodeState,
              contentNodeCount
            })
            state = stateValue
            stateValue = state.get()
          }
          if (state.getType() !== 'template') {
            child.after(stateValue)
          }
          else {
            nodeState = 'template'
            let template = document.createElement('template')
            template.innerHTML = stateValue
            let nodes = template.content.childNodes
            contentNodeCount = nodes.length
            child.after(...nodes)
          }
        }
      }
    }

    let target = el || document.createElement('template')
    let prevStateMode = stateMode
    stateMode = 'template'
    target.innerHTML = this.get()();
    stateMode = prevStateMode
    let children = el ? target.children : target.content.children
    for (let i = 0; i < children.length; i++) {
      hydrateChild(children.item(i))
    }
    return el ? undefined : children
  }
  getTransformations() {
    return this.transformations
  }
  setTemplateStartNode(node) {
    this.templateStartNode = node
  }
  setTemplateEndNode(node) {
    this.templateEndNode = node
  }
  setLastElementNode(node) {
    this.lastElementNode = node
  }
  setType(type) {
    this.type = type
  }
  transform() {
    let data = this.get()
    this.transformations.forEach(i => {
      if (i.closure) {
        let prevStateMode = stateMode
        stateMode = 'eval'
        data = i.closure()
        stateMode = prevStateMode
      }
      if (i.name !== 'call') {
        if (isPromise(data)) {
          data.then((result) => {
            transform(i, result)
          })
        } else {
          transform(i, data)
        }
      }
    })
    if (this.stateKey) {
      this.owningState.transform()
    }
  }
  set(newValue) {
    const value = this.get()
    if (Object.is(value, newValue)) return
    this.setDirect(newValue)
    this.transform()
    let thisValue = this.get()
    if (thisValue && typeof thisValue === 'object') {
      Object.keys(thisValue).forEach(i => {
        if (i in this.childStates) {
          this.childStates[i].set(thisValue[i])
        }
      })
    }
  }
  setChildState(prop, value) {
    let childState = this.getChildState(prop)
    childState.set(value)
  }
  get() {
    return this.valueKey ? this.owningValue[this.valueKey] : this.owningValue
  }
  getFunction(argsIdx) {
    return () => {
      let func = this.get()
      if (this.fnArgs) {
        func(...this.fnArgs[argsIdx])
      }
      else {
        func()
      }
    }
  }
  getChildState(prop) {
    let owningState = this.owningState
    if (this.stateKey) owningState = owningState.childStates[this.stateKey]
    if (prop in owningState.childStates) return owningState.childStates[prop]
    let child = new State(this.get()[prop])
    owningState.childStates[prop] = child
    child.owningState = owningState
    child.stateKey = prop
    child.owningValue = this.owningValue
    if (this.valueKey) child.owningValue = this.owningValue[this.valueKey]
    child.valueKey = prop
    return child
  }
  setDirect(value) {
    if (this.valueKey) this.owningValue[this.valueKey] = value
    else { this.owningValue = value }
  }
  toString(id) {
    if (this.type === 'fn') return ':' + id + '-' + (this.fnArgs.length - 1)
    return '<!--m-s' + id + '-->'
  }
  args(lastStateMode, ...values) {
    this.addFnArgs(values)
    stateMode = lastStateMode
    return this
  }
  addFnArgs(values) {
    if (!this.fnArgs) this.fnArgs = []
    this.fnArgs.push(values)
  }
  pop() {
    this.get().pop()
    let last = this.lastElementNode
    if (!last) return
    let previous = last.previousElementSibling
    last.remove()
    this.lastElementNode = previous
  }
  push(item) {
    let list = this.get()
    list.push(item)
    let template = this.listItemBlueprint(list.length - 1)
    let templateEl = document.createElement('template')
    templateEl.innerHTML = template
    templateEl = templateEl.content.children[0]
    this.templateStartNode.parentNode.appendChild(templateEl)
    this.lastElementNode = templateEl
  }
  setListItemBlueprint(value) {
    this.listItemBlueprint = value
  }
}

function transform(transformation, data) {
  let { name } = transformation
  if (name === 'state') {
    transformation.state.set(data)
  }
  else if (name === 'call') {
    data()
  }
  else if (name === 'template') {
    let { node, nodeState, contentNodeCount } = transformation
    let removeContentNodes = () => {
      let nodeToRemove = node
      while (contentNodeCount) {
        nodeToRemove = nodeToRemove.nextSibling
        nodeToRemove.remove()
        contentNodeCount--
      }
    }

    while (data instanceof State) {
      let value = data.get()
      if (!(value instanceof State)) break
    }
    let value = data instanceof State ? data.get() : data
    if (!(data instanceof State) || data.getType() !== 'template') {
      if (nodeState === 'template') {
        removeContentNodes()
        node.after(value)
      }
      else {
        node.nextSibling.nodeValue = value
      }
      contentNodeCount = 1
    }
    else if (data instanceof State && data.getType() === 'template') {
      removeContentNodes()
      let template = document.createElement('template')
      template.innerHTML = value
      let nodes = template.content.childNodes
      contentNodeCount = nodes.length
      node.after(...nodes)
    }
  }
  else if (name === 'text') {
    transformation.node.nodeValue = data
  }
  else if (name === 'event') {
    let { node, event, currentHandler, state, argsIdx } = transformation

    node.removeEventListener(event, currentHandler)
    let handler = state.getFunction(argsIdx)
    node.addEventListener(event, handler)
    transformation.currentHandler = handler
  }
}

function isPromise(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    'then' in value &&
    typeof value.then === 'function'
  )
}

let registeredStates
let registeringTransformation

export function registerClosure(
  closure,
  transformation
) {
  let transformName = transformation.name
  transformation.closure = closure
  let prevState = stateMode
  stateMode = 'register'
  registeredStates = new Set
  let prevRegisteringState = registeringState
  let prevRegisteringTransformation = registeringTransformation
  registeringTransformation = transformation
  const closureResult = closure()
  registeringState = prevRegisteringState
  registeringTransformation = prevRegisteringTransformation

  if (registeringState && !(registeredStates.has(registeringState))) {
    registeringState.getTransformations().push(registeringTransformation)
    registeredStates.add(registeringState)
  }

  if (transformName !== 'call') {
    if (isPromise(closureResult)) {
      closureResult.then((data) => {
        transform(transformation, data)
      })
    } else {
      transform(transformation, closureResult)
    }
  }

  stateMode = prevState

  return closureResult
}


let registeringState
const stateProxyHandler = {
  get(state, prop, proxy) {
    if (prop === Symbol.toPrimitive) {
      return () => {
        templateToState[templateCount] = state
        return state.toString(templateCount++)
      }
    }
    if (typeof state[prop] === 'function') {
      if (prop === 'args') {
        let lastStateMode = stateMode
        stateMode = undefined
        return state[prop].bind(proxy, lastStateMode)
      }
      return state[prop].bind(state)
    }
    let value = state.get()
    if (stateMode === 'register') {
      if (!state.valueKey) {
        if (registeringState && !(registeredStates.has(registeringState))) {
          registeringState.getTransformations().push(registeringTransformation)
          registeredStates.add(registeringState)
        }
        registeringState = prop === 'value' ? state : state.getChildState(prop)
      }
      else {
        if (!registeringState) registeringState = state
        registeringState = registeringState.getChildState(prop)
      }
    }
    if (prop === 'value' && !state.valueKey) return value
    let propValue = value[prop]
    if (typeof propValue === 'object' || stateMode === 'template') {
      return new Proxy(state.getChildState(prop), stateProxyHandler)
    }
    return propValue
  },
  set(state, prop, value) {
    let stateValue = state.get()
    if (prop === 'value' && (typeof stateValue === 'object' || !state.stateKey)) state.set(value)
    else state.getChildState(prop).set(value)
    return true
  }
}
export function $(value, placeholderValue, asRaw) {
  if (stateMode === 'eval') return typeof value === 'function' ? value() : value
  return new Proxy(new State(value, placeholderValue, asRaw), stateProxyHandler)
}

export function $t(value, placeholderValue) {
  let state = new Proxy(new State(value, placeholderValue), stateProxyHandler)
  state.setType('template')
  return state
}

export function $fn(func) {
  let newState = new Proxy(new State(func, undefined, true), stateProxyHandler)
  newState.setType('fn')
  return newState
}


export function $list(state, each) {
  state.setListItemBlueprint(each)
  let prevStateMode = stateMode
  let template = state.value.reduce((acc, _, i) => acc + each(i), '')
  stateMode = prevStateMode
  return template
}

export function addToDOM(component, el) {
  component.toDOM(el)
}

export function devError(message) {
  if (import.meta.env.DEV) {
    throw new Error(message)
  }
}


export function $watch(closure) {
  registerClosure(closure, { name: 'call' })
}
