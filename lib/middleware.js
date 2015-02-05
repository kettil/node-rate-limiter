'use strict';
var _  = require('underscore');
var q  = require('q');

var isAlphanumeric = function (v) {
    return _.isString(v) || _.isNumber(v);
};

module.exports = {
    express: function(key, withHeader) {
        var self = this;
        if (!(isAlphanumeric(key) || _.isArray(key) || _.isFunction(key))) {
            throw new Error('key is not a string, array or function');
        }
        // default is true
        withHeader = (withHeader !== false);

        return function(req, res, next) {
            q.fcall(function() {
                if (_.isFunction(key)) {
                    return key(req);
                }
                return key;
            }).then(self.exec.bind(self)).spread(function(limit, remaining, reset, withDelay) {
                if (withHeader) {
                    res.header('X-RateLimit-Limit', limit);
                    res.header('X-RateLimit-Remaining', Math.max(0, remaining));
                    res.header('X-RateLimit-Reset', Math.ceil((Date.now() + reset) / 1000));
                }
                if (remaining >= 0 || withDelay) {
                    next();
                } else {
                    if (withHeader) {
                        res.header('Retry-After', Math.ceil(reset / 1000));
                    }
                    res.status(429).end('Too Many Requests');
                }
            }).fail(next);
        };
    }
};


