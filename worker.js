require('babel/polyfill');

var _ = require('lodash');
require('./lib/mongoose');

var q = require('./lib/kue').jobs;
var csw = require('./lib/tasks/harvest-csw');
var wfs = require('./lib/tasks/lookup-wfs');
var processRecord = require('./lib/tasks/process-record').exec;
var consolidateDataset = require('./lib/tasks/consolidate-dataset').exec;

var RemoteResourceCheck = require('./lib/tasks/check-remote-resource');

// To remove in the future
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('ssl-root-cas/latest').inject();

q.process('harvest-csw', 4, csw.harvest);
q.process('lookup-wfs', 10, wfs.lookup);
q.process('process-record', 20, processRecord);
q.process('dataset:consolidate', 20, consolidateDataset);

q.process('dgv:publish', 5, require('./lib/tasks/dgfr/publish'));
q.process('dgv:fetch', 1, require('./lib/tasks/dgfr/fetch'));

q.process('remote-resource:check', 10, function (kueJob, doneCallback) {
    var job = new RemoteResourceCheck(kueJob.data);
    job.exec().nodeify(doneCallback);
});

var gracefulShutdown = _.once(function () {
    q.shutdown(5000, function (err) {
        console.log( 'Job queue is shut down. ', err || '');
    });
    process.exit();
});

process.on('message', function (msg) {
    if (msg === 'shutdown') {
        gracefulShutdown();
    }
});

process.on('SIGTERM', gracefulShutdown);

process.on('uncaughtException', function (err) {
    console.log('Uncaught exception!!');
    console.log(err);
    gracefulShutdown();
});
