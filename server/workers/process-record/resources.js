var mongoose = require('../../mongoose');
var Service = mongoose.model('Service');
var tld = require('tldjs');
var debug = require('debug')('process-record');
var url = require('../../url');
var async = require('async');

var createRelatedService = function(record, location, name, protocol, done) {
    if (!name) {
        return done();
    }

    Service.findByLocationAndProtocol(location, protocol, function(err, service) {
        if (err) return done(err);

        if (service) {
            record.upsertRelatedService(service, name);
            debug('related service already known');
            return done();
        } 

        if (!service) {
            Service.create({ location: location, protocol: protocol }, function(err, service) {
                if (err) return done(err);

                record.upsertRelatedService(service, name);
                debug('related service has been created!');
                return done();
            });
        }
    });
};

var wfs = function(record, resource, next, done) {
    var location;

    // TODO: Refactor
    try {
        location = url.normalize(url.parse(resource.link, true));
    } catch (e) {
        console.trace(e);
        return next();
    }

    var query = location.query;
    var typeName = query.typename || query.typenames || query.layers;

    if (resource.protocol && resource.protocol.toLowerCase().indexOf('wfs') !== -1 && (typeName || resource.name)) {
        debug('found resource provided by WFS (general)');
        return createRelatedService(record, resource.link, typeName || resource.name, 'wfs', done);
    }

    if (query.service && query.service.toLowerCase() === 'wfs' && typeName) {
        debug('found resource provided by WFS (infered using typeName(s))');
        return createRelatedService(record, resource.link, typeName, 'wfs', done);
    }

    debug('not a WFS-provided resource');

    next();
};

var wms = function(record, resource, next, done) {
    if (resource.protocol && resource.protocol.toLowerCase().indexOf('wms') !== -1 && resource.name) {
        return createRelatedService(record, resource.link, resource.name, 'wms', done);
    }

    next();
};

exports.all = function(record, resource, done) {
    debug('process online resource');

    var pipeline = [wfs, wms];

    if (!resource.link) return done();

    if (!tld.tldExists(resource.link)) {
        debug('related service dropped (TLD not exists) : %s', resource.link);
        return done();
    }

    async.series(pipeline.map(function(step) {
        return function(cb) {
            step(record, resource, cb, done);
        };
    }), function() {
        done();
    });
};
