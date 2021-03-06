/**
 * Created by julia on 07.11.2016.
 */
let Player = require('./player');
let ytdl = require('ytdl-core');
let winston = require('winston');
let EventEmitter = require('eventemitter3');
let SongImporter = require('./songImporter');
let queueModel = require('../DB/queue');
// let Selector = require('./selector');
let async = require("async");
class VoiceManager extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(200);
        this.players = {};
    }

    join(msg, cb) {
        if (msg.guild) {
            let conn = rem.voiceConnections.get(msg.guild.id);
            if (!conn) {
                if (msg.member.voiceState.channelID) {
                    rem.joinVoiceChannel(msg.member.voiceState.channelID).then((connection) => {
                        if (typeof (this.players[msg.guild.id]) === 'undefined') {
                            this.createPlayer(msg, connection, ytdl);
                        }
                        cb(null, connection);
                    }).catch(err => {
                        console.log(err);
                        return cb('joinVoice.error');
                    });
                } else {
                    cb('joinVoice.no-voice');
                }
            } else {
                console.log('Found Connection!');
                cb(null, conn);
            }
        }
    }

    leave(msg, cb) {
        if (msg.guild) {
            let conn = rem.voiceConnections.get(msg.guild.id);
            if (conn) {
                rem.voiceConnections.leave(msg.guild.id);
                this.players[msg.guild.id] = null;
                delete this.players[msg.guild.id];
                cb();
            } else {
                cb('generic.no-voice');
            }
        }
    }

    play(msg) {
        this.addToQueue(msg, true);
    }

    pause(msg) {
        try {
            this.players[msg.guild.id].pause();
            this.emit(`${msg.id}_success`);
        } catch (e) {
            this.emit(`${msg.id}_error`);
        }
    }

    resume(msg) {
        try {
            this.players[msg.guild.id].resume();
            this.emit(`${msg.id}_success`);
        } catch (e) {
            this.emit(`${msg.id}_error`);
        }
    }

    addToQueue(msg, immediate) {
        this.join(msg, (err, conn) => {
            if (err) return this.emit('error', err);
            let importer = new SongImporter(msg, true);
            importer.once('long', (url) => {
                this.emit(`${msg.id}_info`, 'qa.started-download', url);
            });
            importer.once('search-result', (results) => {
                importer.removeAllListeners();
                this.emit(`${msg.id}_search-result`, results);
            });
            importer.once('error', (err) => {
                importer.removeAllListeners();
                this.emit(`${msg.id}_error`, err);
            });
            importer.once('done', (Song) => {
                importer.removeAllListeners();
                this.emit(`${msg.id}_added`, Song);
                if (typeof (this.players[msg.guild.id]) !== 'undefined') {
                    this.players[msg.guild.id].addToQueue(Song, immediate);
                } else {
                    this.createPlayer(msg, conn, ytdl).then(player => {
                        this.players[msg.guild.id].addToQueue(Song, immediate);
                    }).catch(err => winston.error);
                }
            });
        });
    }

    getQueue(msg) {
        if (typeof (this.players[msg.guild.id]) !== 'undefined') {
            let queue = this.players[msg.guild.id].getQueue();
            if (queue.songs.length > 0) {
                this.emit(`${msg.id}_queue`, queue);
            } else {
                this.emit(`${msg.id}_error`, 'generic.no-song-in-queue');
            }
        } else {
            this.emit(`${msg.id}_error`, 'generic.no-song-in-queue');
        }
    }

    getCurrentSong(msg) {
        if (typeof (this.players[msg.guild.id]) !== 'undefined') {
            let queue = this.players[msg.guild.id].getQueue();
            if (queue.songs.length > 0) {
                this.emit(`${msg.id}_queue`, queue);
            } else {
                this.emit(`${msg.id}_error`, 'generic.no-song-in-queue');
            }
        } else {
            this.emit(`${msg.id}_error`, 'generic.no-song-in-queue');
        }
    }

    forceSkip(msg) {
        if (typeof (this.players[msg.guild.id]) !== 'undefined') {
            this.players[msg.guild.id].toggleRepeatSingle(true);
            let song = this.players[msg.guild.id].nextSong();
            if (song) {
                this.emit(`${msg.id}_skipped`, song);
            }
        }
    }

    repeat(msg) {
        if (typeof (this.players[msg.guild.id]) !== 'undefined') {
            return this.players[msg.guild.id].toggleRepeatSingle();
        } else {
            return null;
        }
    }

    bind(msg, cb) {
        if (typeof (this.players[msg.guild.id]) !== 'undefined') {
            let res = this.players[msg.guild.id].bind(msg.channel.id);
            this.players[msg.guild.id].on('announce', (song, channel) => {
                rem.createMessage(channel, `:arrow_forward: **${song.title}** \<${song.url}\>`)
            });
            cb(res);
        } else {
            cb(null);
        }
    }

    setVolume(msg, vol) {
        try {
            this.players[msg.guild.id].setVolume(vol);
            this.emit('success');
        } catch (e) {
            console.log(e);
            this.emit('error');
        }
    }

    addToQueueBatch(msg, songs) {
        this.join(msg, (err, conn) => {
            if (err) return this.emit('error', err);
            console.log('BATCH ' + songs.length);
            async.eachSeries(songs, (song, cb) => {
                if (typeof (this.players[msg.guild.id]) !== 'undefined') {
                    this.players[msg.guild.id].addToQueue(song, false);
                    setTimeout(() => {
                        cb();
                    }, 100);
                } else {
                    this.createPlayer(msg, conn, ytdl).then(player => {
                        player.addToQueue(song, false);
                        setTimeout(() => {
                            cb();
                        }, 100);
                    }).catch(err => cb);
                }
            }, (err) => {
                if (err) return winston.error(err);
            });
        });
    }

    createPlayer(msg, conn, ytdl) {
        return new Promise((resolve, reject) => {
            this.loadQueue(msg.guild.id, (err, queue) => {
                if (err) {
                    winston.error(err);
                    reject(err);
                } else {
                    this.players[msg.guild.id] = new Player(msg, conn, ytdl, queue);
                    this.players[msg.guild.id].on('sync', (queue) => {
                        this.syncQueue(queue)
                    });
                    resolve(this.players[msg.guild.id]);
                }
            });

        });

    }

    shuffleQueue() {

    }

    syncQueue(queue) {
        this.loadQueue(queue.id, (err, dbQueue) => {
            if (err) return winston.error(err);
            queueModel.update({id: queue.id}, {$set: queue}, (err) => {
                if (err) return winston.error(err);
                console.log('synced Queue')
            });
        });
    }

    loadQueue(id, cb) {
        queueModel.findOne({id: id}, (err, Queue) => {
            if (err) return cb(err);
            if (Queue) {
                cb(null, Queue);
            } else {
                this.createQueue(id, cb);
            }
        });
    }

    createQueue(id, cb) {
        let Queue = new queueModel({
            id: id
        });
        Queue.save(cb);
    }
}
module.exports = VoiceManager;