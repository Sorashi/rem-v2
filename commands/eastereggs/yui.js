/**
 * Created by julia on 07.11.2016.
 */
let Command = require('../../Objects/command');
class Magic extends Command {
    constructor(t) {
        super();
        this.cmd = "yui";
        this.cat = "eastereggs";
        this.needGuild = false;
        this.t = t;
        this.accessLevel = 0;
        this.hidden = true;
    }

    run(msg) {
        msg.channel.createMessage('https://rra.ram.moe/i/rkL9kPXNl.gif');
    }
}
module.exports = Magic;