/**
 * Created by julia on 10.11.2016.
 */
let EventEmitter = require('eventemitter3');
let userModel = require('../DB/user');
let Promise = require('bluebird');
class UserManager extends EventEmitter {
    constructor() {
        super();
    }

    createUser(user, cb) {
        let User = new userModel({
            id: user.id,
            name: user.username,
            servers: [],
            settings: [],
            marriages: [],
            levelEnabled: true,
            pmNotifications: true,
            avatar: user.avatarURL ? user.avatarURL : user.defaultAvatarURL,
            created: new Date(),
            blacklist: false,
            verified: false,
            credits: 0,
            rep: 0,
            creditCooldown: new Date(),
            reps: []
        });
        User.save((err) => {
            if (err) return cb(err);
            cb(null, User);
        });
    }

    loadUser(user, cb) {
        userModel.findOne({id: user.id}, (err, User) => {
            if (err) return cb(err);
            if (User) {
                cb(null, User);
            } else {
                this.createUser(user, cb);
            }
        });
    }

    love(target, rep, cb) {
        this.loadUser(target, (err, user) => {
            if (err) return cb(err);
            return user.updateRep(rep, cb);
        });
    }

    checkLoveCD(user) {
        if (user.reps.length === 0 || user.reps.length === 1) {
            return true;
        }
        for (let i = 0; i < user.reps.length; i++) {
            if (user.reps[i] < Date.now()) {
                return true;
            }
        }
        return false;
    }

    addLoveCd(user, cb) {
        let reps = [];
        for (let i = 0; i < user.reps.length; i++) {
            if (user.reps[i] > Date.now()) {
                reps.push(user.reps[i])
            }
        }
        reps.push(Date.now() + 1000 * 60 * 60 * 24);
        userModel.update({id: user.id}, {$set: {reps: reps}}, (err) => {
            if (err) return cb(err);
            cb(null, reps);
        });
    }

    calcLevelXp(level) {
        return Math.floor(level * 2 * 3.14 * 15);
    }

    calcXp(msg) {
        let bonus = Math.floor(msg.content.length / 50);
        bonus = bonus > 10 ? 10 : bonus;
        return 5 + bonus;
    }

    increaseExperience(msg) {
        return new Promise((resolve, reject) => {
            this.getServerData(msg.dbUser, msg.guild.id).then(data => {
                if (data.cooldown < Date.now()) {
                    data.id = data.id ? data.id : data.serverId;
                    data.xp += this.calcXp(msg);
                    data.totalXp += this.calcXp(msg);
                    data.cooldown = Date.now() + 10000;
                    if (data.xp >= this.calcLevelXp(data.level)) {
                        data.level += 1;
                        data.xp = 0;
                    }
                    this.updateServerData(msg.dbUser, data).then(resolve).catch(reject);
                }
            }).catch(reject);
        });
    }

    addServerData(user, data) {
        return new Promise((resolve, reject) => {
            userModel.update({id: user.id}, {$addToSet: {servers: data}}).then(resolve).catch(reject);
        });
    }

    getServerData(user, guildId) {
        return new Promise((resolve, reject) => {
            let found = false;
            for (let i = 0; i < user.servers.length; i++) {
                if (user.servers[i].serverId === guildId) {
                    found = true;
                    resolve(user.servers[i]);
                    break;
                }
            }
            if (!found) {
                let data = {
                    id: guildId,
                    serverId: guildId,
                    pm: true,
                    level: 1,
                    xp: 5,
                    totalXp: 5,
                    cooldown: Date.now() + 10000,
                    muted: false,
                    mutedCd: Date.now(),
                    credits: 0,
                    inventory: [],
                    modCases: []
                };
                this.addServerData(user, data).then(resolve).catch(reject);
            }
        });
    }

    updateServerData(user, data) {
        return new Promise((reject, resolve) => {
            userModel.update({id: user.id, 'servers.serverId': data.serverId}, {
                $set: {
                    'servers.$.cooldown': data.cooldown,
                    'servers.$.xp': data.xp,
                    'servers.$.totalXp': data.totalXp
                }
            }).then(resolve).catch(reject);
        });
    }

}
module.exports = UserManager;