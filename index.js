'use strict';
var _  = require('underscore');
var q  = require('q');
var md = require(__dirname + '/lib/middleware');

var separator = ':';
var regexp    = new RegExp('^[a-z0-9._-]+$', 'i');
// global settings
var settings = {
    client:    undefined,   // redis client
    limit:     10,          // number of requests
    period:    60000,       // in milliseconds (default: 60s)
    delay:     0,           // in milliseconds (0 => Error when reach the limit)
    namespace: ''           // prefix for key
};

var isAlphanumeric = function (v) {
    return _.isString(v) || _.isNumber(v);
};

/**
 *
 * @param name
 * @param options
 * @constructor
 */
var Limiter = function (name, options) {
    options = _.defaults(options || {}, settings);

    if (!(isAlphanumeric(name) && regexp.test(name))) {
        throw new Error('name is not defined');
    }
    if (!(_.isObject(options) && _.isObject(options.client))) {
        throw new Error('database client is not defined (options.client)');
    }
    if (!isAlphanumeric(options.namespace)) {
        throw new Error('namespace must be a string or number (options.namespace)');
    }
    if (!(_.isNumber(options.period) && options.period > 0)) {
        throw new Error('period must be greater than 0 (options.period)');
    }
    if (!(_.isNumber(options.limit) && options.limit > 0)) {
        throw new Error('limit must be greater than 0 (options.limit)');
    }
    if (!(_.isNumber(options.delay) && options.delay >= 0)) {
        throw new Error('delay must be greater or equals to 0 (options.delay)');
    }
    this.options = options;
    this.name    = 'limiter' + separator + name;
    if (regexp.test(options.namespace)) {
        this.name = options.namespace + separator + this.name;
    }
    this.middleware = {};
    // add middleware
    _.each(md, function(middleware, name) {
        this.middleware[name] = middleware.bind(this);
    }, this);
};

_.extend(Limiter.prototype, {
    /**
     * Increases the counter and returns it
     *
     * @param key
     * @returns {promise|*|Q.promise}
     */
    dbTrial: function(key) {
        var options  = this.options;
        var deferred = q.defer();
        options.client.set(key, 1, 'PX', options.period, 'NX', function(err, value) {
            if (err) {
                return deferred.reject(err);
            }
            if (!_.isNull(value)) {
                return deferred.resolve([key, 1]);
            }
            options.client.incr(key, function(err, count) {
                if (err) {
                    return deferred.reject(err);
                }
                deferred.resolve([key, count]);
            });
        });
        return deferred.promise;
    },
    /**
     * Returns the remaining life of the period
     *
     * @param key
     * @param count
     * @returns {promise|*|Q.promise}
     */
    dbLivetime: function(key, count) {
        var options  = this.options;
        var deferred = q.defer();
        options.client.pttl(key, function(err, reset) {
            if (err) {
                return deferred.reject(err);
            }
            switch (reset) {
                case -2:
                    // key does not exist
                    deferred.reject(new Error('Key "' + key + '" does not exist (-2)'));
                    break;
                case -1:
                    // key exists but has no associated expire - set new expire
                    options.client.pexpire(key, options.period, function(err, status) {
                        if (err) {
                            return deferred.reject(err);
                        }
                        if (status === 1) {
                            return deferred.resolve([count, options.period]);
                        }
                        // key does not exist
                        deferred.reject(new Error('Key "' + key + '" does not exist (-1)'));
                    });
                    break;
                default:
                    deferred.resolve([count, reset]);
                    break;
            }
        });
        return deferred.promise;
    },
    /**
     *
     * @param count
     * @param reset
     * @returns {promise|*|Q.promise}
     */
    status: function(count, reset) {
        var limit     = this.options.limit;
        var remaining = this.options.limit - count;
        var withDelay = this.options.delay > 0;

        if (withDelay && remaining < 0) {
            // with delay
            var wait = -1 * remaining * this.options.delay;
            return q.delay(wait).then(function() {
                return [limit, remaining, Math.max(0, reset - wait), withDelay];
            });
        } else {
            // without delay
            return [limit, remaining, reset, withDelay];
        }
    },
    /**
     *
     * @param key
     * @param next
     * @returns {promise|*|Q.promise}
     */
    exec: function(key, next) {
        var self    = this;
        var promise = q.fcall(function() {
            if (isAlphanumeric(key) && regexp.test(key)) {
                // key is a String
                return self.name + separator + key;
            }
            if (_.isArray(key) && key.length > 0) {
                // key is a Array withs keys
                for (var i = 0; i < key.length; i += 1) {
                    if (!(isAlphanumeric(key[i]) && regexp.test(key[i]))) {
                        throw new Error('key[' + i + '] is not a string or empty [type: ' + typeof(key[i]) + ']');
                    }
                }
                return self.name + separator + key.join(separator);
            }
            // throw error
            throw new Error('key is not a string or array (alphanumeric only)');
        }).then(
            self.dbTrial.bind(self)
        ).spread(
            self.dbLivetime.bind(self)
        ).spread(
            self.status.bind(self)
        );
        if (_.isFunction(next)) {
            promise.spread(function(limit, remaining, reset, withDelay) {
                next(null, limit, remaining, reset, withDelay);
            }).fail(next);
            return;
        }
        return promise;
    }
});

/**
 *
 * @param name
 * @param options
 * @returns {Limiter}
 */
var create = function(name, options) {
    return new Limiter(name, options);
};
// ################################################
module.exports = {
    create:  create,
    Limiter: Limiter,
    options: function(options) {
        settings = _.defaults(options, settings);
    }
};







