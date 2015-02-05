'use strict';
var _       = require('underscore');
var q       = require('q');
var assert  = require('assertthat');
var redis   = require('redis');
var limiter = require(__dirname + '/../index');

var file    = __dirname + '/config.json';
var options = require('fs').existsSync(file) ? require(file) : {};
var client  = redis.createClient(null, null, options);

describe('tests of the limiter.Limiter prototype function', function() {
    var instance, key = 'mocha:test';
    beforeEach(function() {
        instance = {
            name:    'limiter',
            options: {
                client:    client,
                limit:     10,
                period:    5000,
                delay:     0,
                namespace: ''
            }
        };
    });
    afterEach(function() {
        instance = undefined;
    });
    describe('dbTrial()', function() {
        before(function() {
            client.del(key);
        });
        afterEach(function() {
            client.del(key);
        });
        it('should return the value of ["' + key + '", 1] => ok', function(done) {
            limiter.Limiter.prototype.dbTrial.call(instance, key).then(function(actual) {
                assert.that(actual, is.equalTo([key, 1]));
                done();
            }).fail(done);
        });
        it('should return the value of ["' + key + '", 2] at the second call => ok', function(done) {
            limiter.Limiter.prototype.dbTrial.call(instance, key)
                .then(limiter.Limiter.prototype.dbTrial.bind(instance, key))
                .then(function(actual) {
                    assert.that(actual, is.equalTo([key, 2]));
                    done();
                }).fail(done);
        });
        it('should return the value of ["' + key + '", 10] at the tenth call => ok', function(done) {
            var promise = limiter.Limiter.prototype.dbTrial.call(instance, key);
            for (var i = 2; i <= 10; i += 1) {
                promise = promise.then(limiter.Limiter.prototype.dbTrial.bind(instance, key));
            }
            promise.then(function(actual) {
                assert.that(actual, is.equalTo([key, 10]));
                done();
            }).fail(done);
        });
    });
    describe('dbLivetime()', function() {
        before(function () {
            client.del(key);
        });
        afterEach(function () {
            client.del(key);
        });
        it('should return a value smaller than options.period => ok', function(done) {
            var i = 2;
            q.fcall(function() {
                client.set(key, i, 'PX', instance.options.period, 'NX');
                return [key, i];
            }).then(function(args) {
                return limiter.Limiter.prototype.dbLivetime.apply(instance, args);
            }).spread(function(count, reset) {
                assert.that(reset, is.lessThan(instance.options.period + 1));
                assert.that(count, is.equalTo(i));
                done();
            }).fail(done);
        });
        it('should return a value greater than 0 => ok', function(done) {
            var i = 3;
            q.fcall(function() {
                client.set(key, i, 'PX', instance.options.period, 'NX');
                return [key, i];
            }).then(function(args) {
                return limiter.Limiter.prototype.dbLivetime.apply(instance, args);
            }).spread(function(count, reset) {
                assert.that(reset, is.greaterThan(0));
                assert.that(count, is.equalTo(i));
                done();
            }).fail(done);
        });
        it('should throw an exception because the value does not exist => exception', function(done) {
            var i = 4;
            instance.options.period = 100;
            this.slow(instance.options.period * 5);
            q.fcall(function() {
                client.set(key, i, 'PX', instance.options.period, 'NX');
                return [key, i];
            }).delay(instance.options.period + 1).then(function(args) {
                return limiter.Limiter.prototype.dbLivetime.apply(instance, args);
            }).spread(function(count, reset) {
                done(new Error('There is no exception thrown [' + count + ', ' + reset + ']'));
            }).fail(function(err) {
                try {
                    assert.that(function() {
                        throw err;
                    }, is.throwing('Key "' + key + '" does not exist (-2)'));
                    done();
                } catch(err) {
                    done(err);
                }
            });
        });
        it('should return the value of [5, 1000] without a TTL was set => ok', function(done) {
            var i = 5;
            instance.options.period = 1000;
            q.fcall(function() {
                client.set(key, i);
                return [key, i];
            }).then(function(args) {
                return limiter.Limiter.prototype.dbLivetime.apply(instance, args);
            }).then(function(actual) {
                assert.that(actual, is.equalTo([i, instance.options.period]));
                done();
            }).fail(done);
        });
    });
    describe('status()', function() {
        it('should return the value of [10, 4, 100, false] (below the limit and without delay) => ok', function(done) {
            var timestamp = Date.now();
            q.fcall(function() {
                return [6, 100];
            }).then(function(args) {
                return limiter.Limiter.prototype.status.apply(instance, args);
            }).then(function(actual) {
                assert.that(actual, is.equalTo([10, 4, 100, false]));
                assert.that(Date.now() - timestamp, is.lessThan(500));
                done();
            }).fail(done);
        });
        it('should return the value of [10, -1, 100, false] (over the limit and without delay) => ok', function(done) {
            var timestamp = Date.now();
            q.fcall(function() {
                return [11, 100];
            }).then(function(args) {
                return limiter.Limiter.prototype.status.apply(instance, args);
            }).then(function(actual) {
                assert.that(actual, is.equalTo([10, -1, 100, false]));
                assert.that(Date.now() - timestamp, is.lessThan(500));
                done();
            }).fail(done);
        });
        it('should return the value of [10, 4, 100, true] (below the limit and with delay) => ok', function(done) {
            this.timeout(3000);
            this.slow(1000);
            instance.options.delay = 1001;
            var timestamp = Date.now();
            q.fcall(function() {
                return [6, 100];
            }).then(function(args) {
                return limiter.Limiter.prototype.status.apply(instance, args);
            }).then(function(actual) {
                assert.that(actual, is.equalTo([10, 4, 100, true]));
                assert.that(Date.now() - timestamp, is.lessThan(500));
                done();
            }).fail(done);
        });
        it('should return the value of [10, -1, 100, true] (over the limit and with delay) => ok', function(done) {
            this.timeout(6000);
            this.slow(3000);
            instance.options.delay = 1000;
            var timestamp = Date.now();
            q.fcall(function() {
                return limiter.Limiter.prototype.status.apply(instance, [11, 1000]);
            }).then(function(actual) {
                assert.that(actual, is.equalTo([10, -1, 0, true]));
                assert.that(Date.now() - timestamp, is.between(1000, 1200));
                done();
            }).fail(done);
        });
    });
    describe('exec()', function() {
        beforeEach(function() {
            instance.dbTrial    = function() { return []; };
            instance.dbLivetime = function() { return []; };
            instance.status     = function() { return []; };
        });

        it('with a string as a parameter => ok', function(done) {
            instance.dbTrial = function(actual) {
                assert.that(actual, is.equalTo('limiter:mocha'));
                return [];
            };
            limiter.Limiter.prototype.exec.call(instance, 'mocha', done);
        });
        it('with a number as a parameter => ok', function(done) {
            instance.dbTrial = function(actual) {
                assert.that(actual, is.equalTo('limiter:11'));
                return [];
            };
            limiter.Limiter.prototype.exec.call(instance, 11, done);
        });
        it('with an array as a parameter => ok', function(done) {
            instance.dbTrial = function(actual) {
                assert.that(actual, is.equalTo('limiter:a:b:1'));
                return [];
            };
            limiter.Limiter.prototype.exec.call(instance, ['a', 'b', 1], done);
        });
        it('with an object as a parameter => exception', function(done) {
            limiter.Limiter.prototype.exec.call(instance, {a: 'b'}, function(err) {
                try {
                    assert.that(function() {
                        throw err;
                    }, is.throwing('key is not a string or array (alphanumeric only)'));
                    done();
                } catch(err) {
                    done(err);
                }
            });
        });
        it('with callback => ok', function(done) {
            instance.dbTrial = function(key) {
                return [key, 8];
            };
            instance.dbLivetime = function(key, count) {
                return [count, 10000];
            };
            instance.status = function(count, reset) {
                return [
                    this.options.limit,
                    this.options.limit - count,
                    reset,
                    this.options.delay > 0
                ];
            };
            limiter.Limiter.prototype.exec.call(instance, 'mocha', function(err) {
                if (err) {
                    return done(err);
                }
                // err, limit, remaining, reset, withDelay
                assert.that([].slice.call(arguments), is.equalTo([
                    null, 10, 2, 10000, false
                ]));
                done();
            });
        });
        it('with promise => ok', function(done) {
            instance.dbTrial = function(key) {
                return [key, 8];
            };
            instance.dbLivetime = function(key, count) {
                return [count, 10000];
            };
            instance.status = function(count, reset) {
                return [
                    this.options.limit,
                    this.options.limit - count,
                    reset,
                    this.options.delay > 0
                ];
            };
            limiter.Limiter.prototype.exec.call(instance, 'mocha').then(function(actual) {
                assert.that(actual, is.equalTo([10, 2, 10000, false]));
                done();
            }).fail(done);
        });
    });
});

describe('create a limiter.Limiter instance', function() {
    it('without parameters => exception', function () {
        var actual = function() {
            return new limiter.Limiter();
        };
        assert.that(actual, is.throwing('name is not defined'));
    });
    it('with name and without options => exception', function () {
        var actual = function() {
            return new limiter.Limiter('name');
        };
        assert.that(actual, is.throwing('database client is not defined (options.client)'));
    });
    it('with name and without options.client => exception', function () {
        var actual = function() {
            return new limiter.Limiter('name');
        };
        assert.that(actual, is.throwing('database client is not defined (options.client)'));
    });
    it('with name (and with only options.client) => ok', function () {
        var actual = (new limiter.Limiter('name', {
            client: client
        })).name;
        assert.that(actual, is.equalTo('limiter:name'));
    });
    it('with name and with only options.client => ok', function () {
        var actual = new limiter.Limiter('name', {
            client: client
        }).options.client;
        assert.that(actual, is.sameAs(client));
    });
    describe('with name, options.client and', function () {
        // ##########################
        // Options.namespace
        it('with options.namespace => ok', function () {
            var actual = (new limiter.Limiter('name', {
                namespace: 'space',
                client:    client
            })).name;
            assert.that(actual, is.equalTo('space:limiter:name'));
        });
        it('with wrong options.namespace (array) => exception', function () {
            var actual = function() {
                return new limiter.Limiter('name', {
                    namespace: ['space'],
                    client: client
                });
            };
            assert.that(actual, is.throwing('namespace must be a string or number (options.namespace)'));
        });
        // ##########################
        // Options.limit
        it('with options.limit => ok', function () {
            var actual = (new limiter.Limiter('name', {
                limit:  100,
                client: client
            })).options.limit;
            assert.that(actual, is.equalTo(100));
        });
        it('with wrong options.limit (string) => exception', function () {
            var actual = function () {
                return new limiter.Limiter('name', {
                    limit:  'infinity',
                    client: client
                });
            };
            assert.that(actual, is.throwing('limit must be greater than 0 (options.limit)'));
        });
        // ##########################
        // Options.period
        it('with options.period => ok', function () {
            var actual = (new limiter.Limiter('name', {
                period:  60000,
                client: client
            })).options.period;
            assert.that(actual, is.equalTo(60000));
        });
        it('with wrong options.period (string) => exception', function () {
            var actual = function () {
                return new limiter.Limiter('name', {
                    period: 'infinity',
                    client: client
                });
            };
            assert.that(actual, is.throwing('period must be greater than 0 (options.period)'));
        });
        // ##########################
        // Options.delay
        it('with options.delay => ok', function () {
            var actual = (new limiter.Limiter('name', {
                delay:  1000,
                client: client
            })).options.delay;
            assert.that(actual, is.equalTo(1000));
        });
        it('with wrong options.delay (string) => exception', function () {
            var actual = function () {
                return new limiter.Limiter('name', {
                    delay:  'no',
                    client: client
                });
            };
            assert.that(actual, is.throwing('delay must be greater or equals to 0 (options.delay)'));
        });
    });
});
describe('call limiter.create()', function () {
    it('and return a instance of Limiter => ok', function () {
        var actual = limiter.create('name', {client: client});
        assert.that(actual, is.instanceOf(limiter.Limiter));
    });
    it('without parameters => exception', function () {
        var actual = function () {
            limiter.create();
        };
        assert.that(actual, is.throwing('name is not defined'));
    });
    it('with only the first parameter => exception', function () {
        var actual = function () {
            limiter.create('name');
        };
        assert.that(actual, is.throwing('database client is not defined (options.client)'));
    });
});

describe('functional test', function () {
    var instance;
    afterEach(function() {
        instance = undefined;
    });
    describe('- call 7 times, with a limit of 5', function () {
        beforeEach(function() {
            instance = limiter.create('mocha', {
                client: client,
                limit: 5,
                period: 500,
                delay: 0,
                namespace: ''
            });
        });
        _.each(_.range(1, 8), function(i) {
            it('- ' + i + '. Calling (remaining = ' + (5 - i) + ') => ok', function(done) {
                instance.exec('test1').spread(function(limit, remaining, reset, withDelay) {
                    assert.that(limit, is.equalTo(5));
                    assert.that(remaining, is.equalTo(5 - i));
                    assert.that(reset, is.between(450, 501));
                    assert.that(withDelay, is.false());
                    done();
                }).fail(done);
            });
        });
    });
    describe('- call 7 times, with a limit of 3 and delay between calls', function () {
        beforeEach(function() {
            instance = limiter.create('mocha', {
                client: client,
                limit: 3,
                period: 500,
                delay: 0,
                namespace: ''
            });
        });
        _.each(_.range(1, 5), function(i) {
            it('- ' + i + '. Calling (remaining = ' + (3 - i) + ') => ok', function(done) {
                this.slow(400);
                instance.exec('test2').delay(150).spread(function(limit, remaining, reset, withDelay) {
                    var factor = 150 * (i - 1);
                    assert.that(limit, is.equalTo(3));
                    assert.that(remaining, is.equalTo(3 - i));
                    assert.that(reset, is.between(450 - factor, 501 - factor));
                    assert.that(withDelay, is.false());
                    done();
                }).fail(done);
            });
        });
        _.each(_.range(1, 4), function(i) {
            it('- ' + (i + 4) + '. Calling (remaining = ' + (3 - i) + ') => ok', function(done) {
                this.slow(400);
                instance.exec('test2').delay(150).spread(function(limit, remaining, reset, withDelay) {
                    var factor = 150 * (i - 1);
                    assert.that(limit, is.equalTo(3));
                    assert.that(remaining, is.equalTo(3 - i));
                    assert.that(reset, is.between(450 - factor, 501 - factor));
                    assert.that(withDelay, is.false());
                    done();
                }).fail(done);
            });
        });
    });
    describe('- call 7 times, with a limit of 4 and a delay of 100ms', function () {
        beforeEach(function() {
            instance = limiter.create('mocha', {
                client: client,
                limit: 4,
                period: 500,
                delay: 100,
                namespace: ''
            });
        });
        _.each(_.range(1, 5), function(i) {
            it('- ' + i + '. Calling (remaining = ' + (4 - i) + ') => ok', function(done) {
                instance.exec('test3').spread(function(limit, remaining, reset, withDelay) {
                    assert.that(limit, is.equalTo(4));
                    assert.that(remaining, is.equalTo(4 - i));
                    assert.that(reset, is.between(400, 501));
                    assert.that(withDelay, is.true());
                    done();
                }).fail(done);
            });
        });
        it('- 5. Calling (remaining = -1) => ok', function(done) {
            this.slow(300);
            instance.exec('test3').spread(function(limit, remaining, reset, withDelay) {
                assert.that(limit, is.equalTo(4));
                assert.that(remaining, is.equalTo(-1));
                assert.that(reset, is.between(300, 401));
                assert.that(withDelay, is.true());
                done();
            }).fail(done);
        });
        it('- 6. Calling (remaining = -2) => ok', function(done) {
            this.slow(500);
            instance.exec('test3').spread(function(limit, remaining, reset, withDelay) {
                assert.that(limit, is.equalTo(4));
                assert.that(remaining, is.equalTo(-2));
                assert.that(reset, is.between(100, 201));
                assert.that(withDelay, is.true());
                done();
            }).fail(done);
        });
        it('- 7. Calling (remaining = -3) => ok', function(done) {
            this.slow(700);
            instance.exec('test3').spread(function(limit, remaining, reset, withDelay) {
                assert.that(limit, is.equalTo(4));
                assert.that(remaining, is.equalTo(-3));
                assert.that(reset, is.equalTo(0));
                assert.that(withDelay, is.true());
                done();
            }).fail(done);
        });
    });
    describe('- call 7 times, with a limit of 4, a delay of 100ms and delay between calls', function () {
        beforeEach(function() {
            instance = limiter.create('mocha', {
                client: client,
                limit: 4,
                period: 1000,
                delay: 100,
                namespace: ''
            });
        });
        _.each(_.range(1, 5), function(i) {
            it('- ' + i + '. Calling (remaining = ' + (4 - i) + ') => ok', function(done) {
                this.slow(400);
                instance.exec('test4').delay(150).spread(function(limit, remaining, reset, withDelay) {
                    var factor = 150 * (i - 1);
                    assert.that(limit, is.equalTo(4));
                    assert.that(remaining, is.equalTo(4 - i));
                    assert.that(reset, is.between(850 - factor, 1001 - factor));
                    assert.that(withDelay, is.true());
                    done();
                }).fail(done);
            });
        });
        it('- 5. Calling (remaining = -1) => ok', function(done) {
            this.slow(600);
            instance.exec('test4').delay(150).spread(function(limit, remaining, reset, withDelay) {
                assert.that(limit, is.equalTo(4));
                assert.that(remaining, is.equalTo(-1));
                assert.that(reset, is.between(200, 301));
                assert.that(withDelay, is.true());
                done();
            }).fail(done);
        });
        it('- 6. Calling (remaining = -2) => ok', function(done) {
            this.slow(800);
            instance.exec('test4').delay(150).spread(function(limit, remaining, reset, withDelay) {
                assert.that(limit, is.equalTo(4));
                assert.that(remaining, is.equalTo(-2));
                assert.that(reset, is.equalTo(0));
                assert.that(withDelay, is.true());
                done();
            }).fail(done);
        });
        it('- 7. Calling (remaining = 3) => ok', function(done) {
            this.slow(400);
            instance.exec('test4').delay(150).spread(function(limit, remaining, reset, withDelay) {
                assert.that(limit, is.equalTo(4));
                assert.that(remaining, is.equalTo(3));
                assert.that(reset, is.between(850, 1001));
                assert.that(withDelay, is.true());
                done();
            }).fail(done);
        });
    });
});