const _ = require('lodash')
const { codeFrameColumns } = require('@babel/code-frame')

const $errorMessages = require('./error_messages')
const twoOrMoreNewLinesRe = /\n{2,}/

const mdReplacements = [
  ['`', '\\`'],
]

//# TODO: rename this method because
//# it does more than append now
const appendErrMsg = (err, messageOrObj) => {
  //# preserve stack
  //# this is the critical part
  //# because the browser has a cached
  //# dynamic stack getter that will
  //# not be evaluated later
  const { stack } = err

  let message = messageOrObj

  //# if our message is an obj w/ multiple props...
  if (_.isObject(messageOrObj)) {
    //# then extract the actual 'message' (the string)
    //# and merge the other props into the existing err
    _.extend(err, _.omit(messageOrObj, 'message'));
    ({ message } = messageOrObj)
  }

  //# preserve message
  //# and toString
  let msg = err.message
  const str = err.toString()

  //# append message
  msg += `\n\n${message}`

  //# set message
  err.message = msg

  //# reset stack by replacing the original first line
  //# with the new one
  err.stack = stack.replace(str, err.toString())

  return err
}

const makeErrFromObj = (obj) => {
  const err2 = new Error(obj.message)

  err2.name = obj.name
  err2.stack = obj.stack

  _.each(obj, (val, prop) => {
    if (!err2[prop]) {
      err2[prop] = val
    }
  })

  return err2
}

const throwErr = (err, options = {}) => {
  if (_.isString(err)) {
    err = cypressErr(err)
  }

  let { onFail } = options

  //# assume onFail is a command if
  //# onFail is present and isnt a function
  if (onFail && !_.isFunction(onFail)) {
    const command = onFail

    //# redefine onFail and automatically
    //# hook this into our command
    onFail = (err) => {
      return command.error(err)
    }
  }

  if (onFail) {
    err.onFail = onFail
  }

  throw err
}

const throwErrByPath = (errPath, args = {}) => {
  let err

  try {
    const obj = errObjByPath($errorMessages, errPath, args, { includeMdMessage: true })

    err = cypressErr(obj.message)
    _.defaults(err, obj)
  } catch (e) {
    err = internalErr(e)
  }

  return throwErr(err, args)
}

const internalErr = (err) => {
  err = new Error(err)
  err.name = 'InternalError'

  return err
}

const cypressErr = (err) => {
  err = new Error(err)
  err.name = 'CypressError'

  return err
}

const normalizeMsgNewLines = (message) => {
  //# normalize more than 2 new lines
  //# into only exactly 2 new lines
  return _
  .chain(message)
  .split(twoOrMoreNewLinesRe)
  .compact()
  .join('\n\n')
  .value()
}

const formatErrMsg = (errMessage, options) => {
  const getMsg = function (options) {
    const args = options.args

    if (_.isFunction(errMessage)) {
      return errMessage(args)
    }

    if (_.isObject(errMessage)) {
      errMessage = errMessage.message

      if (!errMessage) {
        throw new Error(`Error message path: '${errMessage}' does not have a 'message' property`)
      }
    }

    return _.reduce(args, (message, argValue, argKey) => {
      return message.replace(new RegExp(`\{\{${argKey}\}\}`, 'g'), argValue)
    }, errMessage)
  }

  return normalizeMsgNewLines(getMsg(options))
}

const errObjByPath = (errLookupObj, errPath, args, { includeMdMessage } = {}) => {
  const errObjStrOrFn = getObjValueByPath(errLookupObj, errPath)

  if (!errObjStrOrFn) {
    throw new Error(`Error message path: '${errPath}' does not exist`)
  }

  let errObj = errObjStrOrFn

  if (_.isString(errObjStrOrFn) || _.isFunction(errObjStrOrFn)) {
    //# normalize into an object if
    //# given a string
    errObj = {
      message: errObjStrOrFn,
    }
  }

  if (includeMdMessage) {
    // Return obj with message and message with escaped markdown
    const escapedArgs = _.mapValues(args, escapeErrMarkdown)

    errObj.mdMessage = formatErrMsg(errObj.message, escapedArgs)
  }

  errObj.message = formatErrMsg(errObj.message, args)

  return errObj
}

const errMsgByPath = (errPath, args) => {
  return getErrMsgWithObjByPath($errorMessages, errPath, args)
}

const getErrMsgWithObjByPath = (errLookupObj, errPath, args) => {
  const errObj = errObjByPath(errLookupObj, errPath, args)

  return errObj.message
}

const getErrMessage = (err) => {
  if (err && err.displayMessage) {
    return err.displayMessage
  }

  if (err && err.message) {
    return err.message
  }

  return err
}

//# TODO: This isn't in use for the reporter,
//# but we may want this for stdout in run mode
const getCodeFrame = (source, path, lineNumber, columnNumber) => {
  const location = { start: { line: lineNumber, column: columnNumber } }
  const options = {
    highlightCode: true,
    forceColor: true,
  }

  return {
    frame: codeFrameColumns(source, location, options),
    path,
    lineNumber,
    columnNumber,
  }
}

const escapeErrMarkdown = (text) => {
  if (!_.isString(text)) {
    return text
  }

  // escape markdown syntax supported by reporter
  return _.reduce(mdReplacements, (str, replacement) => {
    const re = new RegExp(replacement[0], 'g')

    return str.replace(re, replacement[1])
  }, text)
}

const getObjValueByPath = (obj, keyPath) => {
  if (!_.isObject(obj)) {
    throw new Error('The first parameter to utils.getObjValueByPath() must be an object')
  }

  if (!_.isString(keyPath)) {
    throw new Error('The second parameter to utils.getObjValueByPath() must be a string')
  }

  const keys = keyPath.split('.')
  let val = obj

  for (let key of keys) {
    val = val[key]
    if (!val) {
      break
    }
  }

  return val
}

module.exports = {
  appendErrMsg,
  makeErrFromObj,
  throwErr,
  throwErrByPath,
  internalErr,
  cypressErr,
  normalizeMsgNewLines,
  formatErrMsg,
  errObjByPath,
  getErrMsgWithObjByPath,
  getErrMessage,
  errMsgByPath,
  getCodeFrame,
  escapeErrMarkdown,
  getObjValueByPath,
}
