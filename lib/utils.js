var fs = require('fs'),
    async = require('async'),
    logger = require('./logger'),
    prompt = require('prompt'),
    urlFormat = require('url').format,
    urlParse = require('url').parse;


/**
 * Pads a string to minlength by appending spaces.
 *
 * @param {String} str
 * @param {Number} minlength
 * @return {String}
 * @api public
 */

exports.padRight = function (str, minlength) {
    while (str.length < minlength) {
        str = str + ' ';
    }
    return str;
};


exports.longest = function (arr) {
    return arr.reduce(function (a, x) {
        if (x.length > a) {
            return x.length;
        }
        return a;
    }, 0);
};


/**
 * Reads the version property from Jam's package.json
 */

exports.getJamVersion = async.memoize(function (callback) {
    exports.readJSON(__dirname + '/../package.json', function (err, pkg) {
        if (err) {
            return callback(err);
        }
        return callback(null, pkg.version);
    });
});


/**
 * Read a file from the filesystem and parse as JSON
 *
 * @param {String} path
 * @param {Function} callback
 * @api public
 */

exports.readJSON = function (path, callback) {
    fs.readFile(path, function (err, content) {
        var val;
        if (err) {
            return callback(err);
        }
        try {
            val = JSON.parse(content.toString());
        }
        catch (e) {
            var stack = e.stack.split('\n').slice(0, 1);
            stack = stack.concat(['\tin ' + path]);
            e.stack = stack.join('\n');
            return callback(e, null);
        }
        callback(null, val);
    });
};

/**
 * Used by commands wanting to add auth info to a URL. It will only prompt for
 * a password if the URL has a username, but no password associated with it.
 * Optionally you can force an auth prompt if the url has no auth data at all
 * by setting force to true.
 */

exports.completeAuth = function (url, force, callback) {
    var parsed = urlParse(url);
    if (parsed.auth) {
        // if only a username has been specified, ask for password
        if (parsed.auth.split(':').length === 1) {
            return exports.getAuth(url, callback);
        }
    }
    else if (force) {
        // no auth info, but auth required
        return exports.getAuth(url, callback);
    }
    callback(null, url);
};


exports.catchAuthError = function (fn, url, extra_args, callback) {
    fn.apply(null, [url].concat(extra_args).concat(function (err) {
        if (err && err.response && err.response.statusCode === 401) {
            logger.error(err.message || err.toString());
            exports.getAuth(url, function (err, url) {
                if (err) {
                    return callback(err);
                }
                console.log('');
                exports.catchAuthError(fn, url, extra_args, callback);
            });
        }
        else {
            callback.apply(this, arguments);
        }
    }));
};

exports.getPassword = function (callback) {
    process.stdout.write('Password: ');
    if (!prompt.started) {
        prompt.start();
    }
    prompt.readLineHidden(callback);
};

exports.getUsername = function (callback) {
    process.stdout.write('Username: ');
    if (!prompt.started) {
        prompt.start();
    }
    prompt.readLine(callback);
};

exports.getAuth = function (url, callback) {
    var parsed = urlParse(url);
    // if a username has been specified, only ask for password
    if (parsed.auth && parsed.auth.split(':').length === 1) {
        console.log('Please provide credentials for: ' + url);
        exports.getPassword(function (err, password) {
            if (err) {
                return callback(err);
            }
            delete parsed.host;
            parsed.auth += ':' + password;
            console.log('');
            callback(null, urlFormat(parsed));
        });
    }
    else {
        delete parsed.auth;
        delete parsed.host;
        var noauth = exports.noAuthURL(url);
        console.log('Please provide credentials for: ' + noauth);
        exports.getUsername(function (err, username) {
            if (err) {
                return callback(err);
            }
            exports.getPassword(function (err, password) {
                if (err) {
                    return callback(err);
                }
                parsed.auth = username + ':' + password;
                callback(null, urlFormat(parsed));
            });
        });
    }
};

/**
 * Used by commands wanting to report a URL on the command-line without giving
 * away auth info.
 */

exports.noAuthURL = function (url) {
    var parts = urlParse(url);
    delete parts.auth;
    delete parts.host;
    return urlFormat(parts);
};

exports.ISODateString = function (d) {
    function pad(n){
        return n < 10 ? '0' + n : n;
    }
    return d.getUTCFullYear() + '-' +
        pad(d.getUTCMonth() + 1) + '-' +
        pad(d.getUTCDate()) + 'T' +
        pad(d.getUTCHours()) + ':' +
        pad(d.getUTCMinutes()) + ':' +
        pad(d.getUTCSeconds()) + 'Z';
};

exports.getConfirmation = function (msg, callback) {
    function trim(str) {
        var trimmed = str.replace(/^\s*/, '');
        return trimmed.replace(/\s*$/, '');
    }

    if (!prompt.started) {
        prompt.start();
    }

    var val;
    async.until(
        function () {
            var valid = (val === '' || val === 'y' || val === 'n');
            if (!valid) {
                process.stdout.write(msg + ' [Y/n]: ');
            }
            return valid;
        },
        function (cb) {
            prompt.readLine(function (err, line) {
                if (err) {
                    return cb(err);
                }
                val = trim(line).toLowerCase();
                cb();
            });
        },
        function (err) {
            callback(err, val === '' || val === 'y');
        }
    );
};

exports.truncate = function (str, max) {
    if (str.length <= max) {
        return str;
    }
    return str.substr(0, max - 1) + '…';
};
