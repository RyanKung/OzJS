/**
 * Copyright (C) 2011, Dexter.Yy, MIT License
 */
define("mod/url", ["mod/lang", "mod/browsers"], function(_, browsers){

    var encode = encodeURIComponent,
        decode = decodeURIComponent,
        doc = document,
        _has_pushState = !!history.pushState,
        RE_URLROOT = _has_pushState ? /(https?:\/\/.+?|^)\// : /.*?(?=#|$)/,
        RE_HASHBANG = _has_pushState ? /#.*/ : /#!?\/?/,
        RE_KVRULE = /([^&=\?]+)(=[^&=]*)/g,
        RE_GETHASH = /.+#!?\/?/,
        _default_config = {
            win: window,
            base: '',
            autotidy: true
        },
        _default_nav_opt = {
            replace: false,
            route: true
        };

    function route_match(url, route, handler){
        var rule = Array.isArray(route) ? route[0] : route;
        if (typeof rule === "object") {
            for (var r in route) {
                route_match(url, r, route[r]);
            }
        }
        if (typeof rule !== "string") {
            return false;
        }
        var re_route = (_has_pushState ? "^" : "^#!?") 
                        + (rule && rule.replace(/\/?$/, '/?').replace(/:\w+/g, '([^\/#\\?]+)') || "") + "(\\?.*|$)",
            args = url.match(new RegExp(re_route));
        if (!args) {
            if (url !== rule) {
                return rule !== route && route_match(url, route.slice(1), handler) || false;
            } else {
                args = [""];
            }
        }
        var params = {},
            kv = args.pop().replace(/^\?/, '').split(/&/);
        for (var i = 0, a, l = kv.length; i < l; i++) {
            a = kv[i].split("=");
            if (a[0]) {
                params[a[0]] = a[1];
            }
        }
        args[0] = params;
        handler.apply(this, args);
        return true;
    }

    /**
     * @return {array}  例如"http://10.0.2.172:9253/page/2/#!/page/1/?name=yy&no=3"
     *                  在ie10-里返回值为[{ "name": "yy", "no": "3" }, "page", "1"]
     *                  在支持pushState的浏览器里返回[{}, "page", "2"]
     */
    function parse(s){
        s = s.replace(RE_URLROOT, '').replace(RE_HASHBANG, '');
        if (!s)
            return [{}];
        s = s.split('/');
        var kv, p = {}, hasParam,
            o = s.pop(),
            prule = /\?.*/;
        if (o) {
            var end = o.replace(prule, '');
            if (/\=/.test(o)) {
                if (end && prule.test(o)) {
                    s.push(end);
                }
                while (kv = RE_KVRULE.exec(o)) {
                    p[kv[1]] = kv[2].substr(1);
                }
            } else {
                s.push(end);
                p = {};
            }
        } else {
            p = {};
        }
        s.unshift(p);
        return s;
    }

    function param(obj, opt){
        obj = Array.isArray(obj) ? obj.slice() : [obj];
        var s = obj.shift(), o = [];
        obj = obj.filter(function(a){ return a !== ""; });
        for (var k in s) {
            if (k) {
                o.push(encode(k) + '=' + encode(s[k]));
            }
        }
        var params = o.length ? '?' + o.join("&") : '';
        if (opt && opt.ending) {
            obj.push(params);
            return obj.join('/');
        } else {
            return obj.join('/') + params;
        }
    }

    function tidy_url(opt){
        var loc = this.location;
        if (_has_pushState) {
            if (/#/.test(loc.href)) {
                var hash_url = loc.href.replace(this.base || this.domain, '');
                if (/#.*#/.test(hash_url)) {
                    hash_url = hash_url.replace(/(.*?#.*?)#.*/, '$1');
                }
                hash_url = hash_url.replace(/^\/?#!?\/?/, '/');
                if (this.checkRules(hash_url, this._route_config)) {
                    loc.replace(hash_url);
                } else {
                    loc.replace(loc.href.replace(/#.*/, ''));
                }
            }
        } else {
            var key_url = '#!' + get_key_url.apply(this);
            if (this.checkRules(key_url, this._route_config)) {
                this.load('/' + key_url, { replace: true });
            } else if (/#.*#/.test(loc.href)) {
                loc.replace(loc.href.replace(/(.*?#.*?)#.*/, '$1'));
            }
        }
    }

    function get_key_url(){
        return this.location.href.replace(this.base || this.domain, '').replace(/#.*/, '');
    }

    function URLkit(){
        var self = this;
        this._route_config = [];
        this._hash_cache = false;
        this.handler = function(){
            var current_hash = self.getHash();
            if (current_hash === self._hash_cache) {
                return;
            }
            self._hash_cache = current_hash;
            if (self.autotidy) {
                tidy_url.call(self, self);
            }
            var succ = self.checkRules(current_hash, self._route_config);
            if (!succ) {
                self._defaultHandler.apply(self, self.parse(self.getHash()));
            }
        };
    }

    URLkit.prototype = {

        set: function(opt){
            _.config(this, opt || {}, _default_config);
            var loc = this.location = this.win.location;
            this.domain = loc.protocol + '//' + loc.host;
            return this;
        },

        listen: function(opt){
            this.set(opt);
            var w = this.win,
                docmode = doc.documentMode;
            if (_has_pushState) {
                w.addEventListener("popstate", this.handler, false);
                setTimeout(this.handler, 0);
            } else if ('onhashchange' in w  && (docmode === undefined || docmode > 7)) {
                if ('addEventListener' in w) {
                    w.addEventListener("hashchange", this.handler, false);
                } else {
                    w.attachEvent("onhashchange", this.handler);
                }
                setTimeout(this.handler, 0);
            } else {
                this.timer = setInterval(this.handler, 50);
            }
            return this;
        },

        stop: function(){
            this.win.removeEventListener("hashchange");
            clearInterval(this.timer);
            return this;
        },

        route: function(route, handler){
            if (route === "default") {
                this._defaultHandler = handler;
            } else {
                this._route_config.push([route, handler]);
            }
            return this;
        },

        nav: function(name, value, opt){
            var params, data, n,
                isMuti = typeof name === 'object',
                loc = this.location,
                loc_hash = this.getHash(),
                hash = this.parse(loc_hash),
                l = hash.length;
            if (isMuti) {
                data = name;
                opt = value;
            } else {
                data = {};
                data[name] = value;
            }
            if (isMuti || value !== undefined) {
                params = hash[0];
                var isEmpty = true;
                for (var i in data) {
                    isEmpty = false;
                    name = i;
                    value = data[i];
                    n = parseInt(name, 10);
                    if (n != name) {
                        if (false === value) {
                            delete params[name];
                        } else {
                            params[name] = value;
                        }
                    } else if (n >= 0) {
                        if (false === value) {
                            if (hash.length > n + 1) {
                                hash.length = n + 1;
                            }
                        } else {
                            hash[n + 1] = value;
                        }
                    }
                }
                if (isEmpty) {
                    return;
                }
                var hashstr;
                if (_has_pushState) {
                    hashstr = '/' + this.param(hash, { ending: true }) + loc.hash;
                } else {
                    hashstr = /#!?\/?/.exec(loc_hash)[0] + this.param(hash);
                }
                this.load(hashstr, opt);
            } else {
                n = parseInt(name, 10);
                if (n != name) {
                    var v = hash[0][name];
                    return v && decode(v);
                } else if (n >= 0) {
                    return decode(hash[n + 1]);
                }
            }
        },

        load: function(url, opt){
            opt = _.config({}, opt || {}, _default_nav_opt);
            if (_has_pushState) {
                if (opt.replace) {
                    history.replaceState({}, doc.title, url);
                } else {
                    history.pushState({}, doc.title, url);
                }
                if (opt.route) {
                    setTimeout(this.handler, 0);
                } else {
                    this._hash_cache = url;
                }
            } else {
                var loc = this.location, base = '/';
                if (/^\//.test(url)) {
                    url = url.replace(/^\//, '');
                } else {
                    base = loc.href.replace(/#.*/, "");
                }
                if (!opt.route) {
                    this._hash_cache = url;
                }
                if (opt.replace) {
                    loc.replace(base + url);
                } else {
                    loc.href = base + url;
                }
            }
        },

        checkRules: function(url, rules){
            var succ;
            rules.forEach(function(args){
                if (!succ) {
                    succ = route_match.apply(this, [url].concat(args));
                }
            });
            return succ;
        },

        parse: parse,
        param: param
    };

    if (_has_pushState) {
        URLkit.prototype.getHash = get_key_url;
    } else {
        URLkit.prototype.getHash = function(){
            return (/#/.test(this.location.href)) ? this.location.href.replace(RE_GETHASH, '#!/') : '#!/';
        };
    }

    var exports = function(win, opt){
        return new URLkit(win, opt);
    };

    exports.parse = parse;
    exports.param = param;
    exports.SUPPORT_PUSHSTATE = _has_pushState;

    return exports;

});
