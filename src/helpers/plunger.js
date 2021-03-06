import Plunger from 'plunger';
import fs from 'fs';
import { dir as tmpDir } from 'tmp';
import { exec } from 'child_process';
import Promise from 'bluebird';
import findit from 'findit';
import crypto from 'crypto';
import rimraf from 'rimraf';
import through2 from 'through2';

const tmpDirAsync = Promise.promisify(tmpDir);
const execAsync = Promise.promisify(exec);
const rimrafAsync = Promise.promisify(rimraf);


export default class SuperPlunger extends Plunger {

    constructor(location, options = {}) {
        super(location, options);
    }

    isArchive() {
        return (this.archive === 'zip' && this.fileExtension === 'zip') || (this.archive === 'rar' && this.fileExtension === 'rar');
    }

    createTempDirectory() {
        return tmpDirAsync({ prefix: 'plunger_', keep: true })
            .then(tmpDirResult => {
                this.tempDirectoryPath = tmpDirResult[0];
                return this.tempDirectoryPath;
            });
    }

    saveArchive() {
        return this.createTempDirectory()
            .then(path => {
                return new Promise((resolve, reject) => {
                    this.archivePath = path + '/archive.' + this.archive;

                    const hash = crypto.createHash('sha1');
                    let readBytes = 0;

                    this
                        .pipeWithResponse(through2.obj((chunk, enc, cb) => {
                            readBytes += chunk.length;
                            if (readBytes > 100 * 1024 * 1204) {
                                this.closeConnection(true);
                                console.log('Too large: %d', readBytes);
                                reject(new Error('Archive is too large'));
                            }
                            cb();
                        }))
                        .once('finish', () => this.readBytes = readBytes);

                    this
                        .pipeWithResponse(hash)
                        .once('finish', () => this.digest = hash.read());

                    this
                        .pipeWithResponse(fs.createWriteStream(this.archivePath))
                        .once('finish', () => resolve(this.archivePath))
                        .on('error', reject);
                });
            });
    }

    decompressArchive() {
        if (this.decompressedDirectoryPath) return Promise.resolve(this.decompressedDirectoryPath);
        if (!this.archivePath) return Promise.reject(new Error('`archivePath` is not defined'));
        let decompressProcess;
        if (this.archive === 'zip') {
            decompressProcess = new Promise((resolve, reject) => {
                exec('unzip -d decompressed archive.zip', { cwd: this.tempDirectoryPath }, err => {
                    if ((err && err.code === 1) || !err) return resolve();
                    reject(err);
                });
            });
        }
        if (this.archive === 'rar') decompressProcess = execAsync('unrar x archive.rar decompressed/', { cwd: this.tempDirectoryPath });
        if (decompressProcess) {
            return decompressProcess.then(() => {
                this.decompressedDirectoryPath = this.tempDirectoryPath + '/decompressed';
                return this.decompressedDirectoryPath;
            });
        } else {
            return Promise.reject('Archive type not supported: ' + this.archive);
        }
    }

    listFiles() {
        if (!this.decompressedDirectoryPath) return Promise.reject(new Error('No iterable path found'));
        const startPoint = this.decompressedDirectoryPath.length + 1;
        const paths = [];
        const datasets = [];
        return new Promise((resolve, reject) => {
            findit(this.decompressedDirectoryPath)
                .on('file', file => {
                    let shortFileName = file.substring(startPoint);
                    paths.push(shortFileName);
                    if (shortFileName.match(/\.(shp|tab|mif)$/i)) datasets.push(shortFileName);
                })
                .on('end', () => resolve({ all: paths, datasets: datasets }))
                .on('error', reject);
        });
    }

    cleanup() {
        if (this.tempDirectoryPath) {
            return rimrafAsync(this.tempDirectoryPath)
                .then(() => this.tempDirectoryPath = undefined);
        }
    }

}
