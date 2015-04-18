// WARNING: This code should get me banned from the coder guild.

function TalkModule() {
    this.C = global.misaka.config.obj.modules.Talk;
    this.info = {
        name: 'Talk',
        description: 'Talking bot!',
        commands: [
          { name: 'talkstart', callback: TalkModule.prototype.onStart.bind(this) },
          { name: 'talkend', callback: TalkModule.prototype.onEnd.bind(this) },
          { name: 'starttalk', callback: TalkModule.prototype.onStart.bind(this) },
          { name: 'endtalk', callback: TalkModule.prototype.onEnd.bind(this) },
        ],
        master: true,
        cooldown: this.C.userCommandCooldown,
    };

    global.misaka._onMessageReceived.push(TalkModule.prototype.onMessage.bind(this));
    this._started = this.C.enable;
}

TalkModule.prototype.onStart = function(data)
{
    this._started = true;
    return this.getString(this.C.module_start_message);
};

TalkModule.prototype.onEnd = function(data)
{
    this._started = false;
    return this.getString(this.C.module_end_message);
};

TalkModule.prototype.onMessage = function(data)
{
    var client = global.misaka.getBot().getClient();

    if (this._started && data.username != global.misaka.config.obj.username)
    {

    }

};

TalkModule.prototype.getString = function(c)
{
    if (!c || !c.length)
        return ;
    if (c instanceof Array)
    {
        var index = Math.min(Math.floor(Math.random() * c.length), c.length - 1);
        return c[index];
    }
    else
        return c;
};

module.exports = TalkModule;
