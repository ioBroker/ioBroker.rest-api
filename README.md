![Logo](admin/rest-api.png)
# REST-API adapter

![Number of Installations](http://iobroker.live/badges/rest-api-installed.svg) ![Number of Installations](http://iobroker.live/badges/rest-api-stable.svg) [![NPM version](http://img.shields.io/npm/v/iobroker.rest-api.svg)](https://www.npmjs.com/package/iobroker.rest-api)
[![Downloads](https://img.shields.io/npm/dm/iobroker.rest-api.svg)](https://www.npmjs.com/package/iobroker.rest-api)
[![Tests](https://travis-ci.org/ioBroker/ioBroker.rest-api.svg?branch=master)](https://travis-ci.org/ioBroker/ioBroker.rest-api)

[![NPM](https://nodei.co/npm/iobroker.rest-api.png?downloads=true)](https://nodei.co/npm/iobroker.rest-api/)

**This adapter uses Sentry libraries to automatically report exceptions and code errors to the developers.** For more details and for information how to disable the error reporting see [Sentry-Plugin Documentation](https://github.com/ioBroker/plugin-sentry#plugin-sentry)! Sentry reporting is used starting with js-controller 3.0.

This is RESTFul interface to read the objects and states from ioBroker and to write/control the states over HTTP Get/Post requests.

The purpose of this adapter is similar to simple-api. But this adapter supports long-polling and URL hooks for subscribes.

It has very useful web interface to play with the requests:

![Screenshot](img/screen.png)

## Usage
Call in browser ```http://ipaddress:8093/``` and use Swagger UI to request and modify the states and objects.

Some request examples:
- `http://ipaddress:8093/v1/state/system.adapter.rest-api.0.memHeapTotal` - read state as JSON
- `http://ipaddress:8093/v1/state/system.adapter.rest-api.0.memHeapTotal/plain` - read state as string (only value)
- `http://ipaddress:8093/v1/state/system.adapter.rest-api.0.memHeapTotal?value=5` - write state with GET (only for back compatibility with simple-api)

## Subscribe on state or object changes
Your application could get notifications by every change of the state or object.

For that your application must provide an HTTP(S) end-point to accept the updates.

Example in node.js see here [demoNodeClient.js](examples/demoNodeClient.js)

## Long polling
This adapter supports subscribe on data changes via long polling. 

Example for browser could be found here: [demoNodeClient.js](examples/demoBrowserClient.html)  

## Web extension
This adapter can run as web-extension. In this case the path is available under http://iipaddress:8082/rest

## Notice
- `POST` is always for creating a resource (does not matter if it was duplicated)
- `PUT` is for checking if resource exists then update, else create new resource
- `PATCH` is always for updating a resource

## Commands
Additionally, you can execute many socket commands via special interface:

`http://ipaddress:8093/v1/command/<commandName>?arg1=Value2&arg2=Value2`

*Not available via GUI*

E.g.
- `http://ipaddress:8093/v1/command/getState?id=system.adapter.admin.0.alive` - to read the state of `system.adapter.admin.0.alive`
- `http://ipaddress:8093/v1/command/readFile?adapter=admin.admin&fileName=admin.png` - to read the file `admin.admin/admin.png` as JSON result
- `http://ipaddress:8093/v1/command/readFile?adapter=admin.admin&fileName=admin.png?binary` - to read the file `admin.admin/admin.png` as file
- `http://ipaddress:8093/v1/command/extendObject?id=system.adapter.admin.0?obj={"common":{"enabled":true}}` - to restart admin

<!-- START -->
### States
- delState(id) - delState
- getStates(pattern) - getStates
- getState(id) - getState
- setState(id, state) - setState
- getBinaryState(id) - getBinaryState
- setBinaryState(id, base64) - setBinaryState
- getForeignStates(pattern) - getForeignStates

### Objects
- getObject(id) - getObject
- getObjects() - getObjects
- getObjectView(design, search, params) - getObjectView
- setObject(id, obj) - setObject
- getAllObjects() - getAllObjects
- extendObject(id, obj) - extendObject
- getForeignObjects(pattern, type) - getForeignObjects
- delObject(id, options) - delObject
- delObjects(id, options) - delObjects

### Files
- readFile(adapter, fileName) - readFile
- readFile64(adapter, fileName) - readFile64
- writeFile64(adapter, fileName, data64, options) - writeFile64
- writeFile(adapter, fileName, data64, options) - writeFile
- unlink(adapter, name) - unlink
- deleteFile(adapter, name) - deleteFile
- deleteFolder(adapter, name) - deleteFolder
- renameFile(adapter, oldName, newName) - renameFile
- rename(adapter, oldName, newName) - rename
- mkdir(adapter, dirName) - mkdir
- readDir(adapter, dirName, options) - readDir
- chmodFile(adapter, fileName, options) - chmodFile
- chownFile(adapter, fileName, options) - chownFile
- fileExists(adapter, fileName) - fileExists

### Admins
- getUserPermissions() - getUserPermissions
- updateLicenses(login, password) - updateLicenses
- getCompactInstances() - getCompactInstances
- getCompactAdapters() - getCompactAdapters
- getCompactInstalled(host) - getCompactInstalled
- getCompactSystemConfig() - getCompactSystemConfig
- getCompactRepository(host) - getCompactRepository
- getCompactHosts() - getCompactHosts
- addUser(user, pass) - addUser
- delUser(user) - delUser
- addGroup(group, desc, acl) - addGroup
- delGroup(group) - delGroup
- changePassword(user, pass) - changePassword

### Others
- log(text, level[info]) - no answer - log
- getHistory(id, options) - getHistory
- httpGet(url) - httpGet
- sendTo(adapterInstance, command, message) - sendTo
- sendToHost(host, command, message) - sendToHost
- authEnabled() - authEnabled
- listPermissions() - listPermissions
- getVersion() - getVersion
- getAdapterName() - getAdapterName
- getHostByIp(ip) - getHostByIp
- requireLog(isEnabled) - requireLog
- readLogs(host) - readLogs
- cmdExec(host, id, cmd) - cmdExec
- getRatings(update) - getRatings
- getCurrentInstance() - getCurrentInstance
- checkFeatureSupported(feature) - checkFeatureSupported
- decrypt(encryptedText) - decrypt
- encrypt(plainText) - encrypt
- getIsEasyModeStrict() - getIsEasyModeStrict
- getEasyMode() - getEasyMode
- getAdapterInstances(adapterName) - getAdapterInstances
- getAdapters(adapterName) - getAdapters

<!-- END -->
<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->

## Changelog
### 0.3.6 (2022-04-22)
* (bluefox) Added object creation and enumerations reading

### 0.3.5 (2022-04-22)
* (bluefox) Allowed the reading of current subscriptions

### 0.3.4 (2022-04-20)
* (bluefox) Corrected subscription

### 0.3.1 (2022-04-15)
* (bluefox) First release

### 0.1.0 (2017-09-14)
* (bluefox) initial commit

## License
Apache 2.0

Copyright (c) 2017-2022 bluefox <dogafox@gmail.com>
