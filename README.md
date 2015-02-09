# kettil-rate-limiter

## Description

Rate limiter with redis as a backend for vertically and horizontally scalable applications.

The module counts the requests from a browser, API, or other. 
When you reach a certain limit in a given period, appropriate measures can be taken.
The Module supports the clustering feature of node.js and/or it can run on multiple servers.

Supports promise [with q](https://www.npmjs.com/package/q).

### Delay-Mode

If a delay is defined, all calls are delayed, when the limit is reached.
The delay is automatically increased with each call.
If delay = 0 then the mode is disabled.

example:
```
limit: 10
delay: 1000ms
```

At the eleventh call a delay of one second occurs and the twelfth call is already delayed by two seconds,
in the thirteenth three seconds and so on...

### Express Middleware

If the option `withHeader` is true, then the response header is extended with every request.
The following header entries are added. The last entry will only be sent if the limit is exceeded.
```
res.header('X-RateLimit-Limit', limit);
res.header('X-RateLimit-Remaining', Math.max(0, remaining));
res.header('X-RateLimit-Reset', Math.ceil((Date.now() + reset) / 1000));
res.header('Retry-After', Math.ceil(reset / 1000));
```

## Requirements

- Redis 2.6.12+ (2.8 recommended)

## Install

```
$ npm install kettil-rate-limiter
```

## Usage

```
var limiter = require('kettil-rate-limiter');
var redis   = require('redis');

// limiter.create(name, options)
var rateLimiter = limiter.create('login', {
    client: redis.createClient(),
    period: 3600000, // 1 hour,
    limit:  100, // 100 requests per hour
});

// ...

// per callback
rateLimiter.exec('my-uniqid-id', function(err, limit, remaining, reset, withDelay) {
    if (err) {
        // ...
    }
    /** 
     * limit     = defined limit
     * remaining = remaining attempts (less than 0, then no more attempts)
     * reset     = remaining time (in milliseconds) to reset the counter
     * withDelay = is true if a delay is defined
     */
    
    // ...
});


// or per promises with q ( https://www.npmjs.com/package/q )
rateLimiter.exec('my-uniqid-id').spread(function(limit, remaining, reset, withDelay) {
    // ...
}).fail(function(err) {
    // ...
});
```

### Middleware - express
```
var limiter = require('kettil-rate-limiter');
var redis   = require('redis');
var express = require('express')
var app = express()


// limiter.create(name, options)
var rateLimiter = limiter.create('login', {
    client: redis.createClient(),
    period: 3600000, // 1 hour,
    limit:  100, // 100 requests per hour
});


// rateLimiter.middleware.express(key, withHeader)
var middleware = rateLimiter.middleware.express(function(req) {
    // generate a Key or Keys (as a string, number or an array)
    var keys = [];
    keys.push('key1');
    keys.push('key2');
    return keys;
}, true)

app.get('/login', middleware, function (req, res) {
  res.send('Hello World!') // or other stuff
});
```

## Options

- `name`: Name for the distinction of multiple use (eg login, registration, etc.) (**required**)
- `options.client`: redis instance (**required**)
- `options.limit`: Number of allowed requests [default: 10]
- `options.period`: Length of period of requests (in milliseconds) [default: 60000]
- `options.delay`: Delay (in milliseconds) [default: 0]
- `options.namespace`: For the multiple use of the same redis instance [default: '']

## Test

```
npm test
```
  
## License
MIT
