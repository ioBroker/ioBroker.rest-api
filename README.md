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

<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->

## Changelog
### 0.3.4 (2022-04-20)
* (bluefox) Corrected subscription

### 0.3.1 (2022-04-15)
* (bluefox) First release

### 0.1.0 (2017-09-14)
* (bluefox) initial commit

## License
Apache 2.0

Copyright (c) 2017-2022 bluefox <dogafox@gmail.com>
