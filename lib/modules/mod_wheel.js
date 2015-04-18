// WARNING: This code should get me banned from the coder guild.
var http = require('http');
var htmlBefore = "<!DOCTYPE html><html><head><title>Abott</title></head><body>";
var htmlAfter = "</body></html>";

function WheelModule() {
    this.C = global.misaka.config.obj.modules.Wheel;

    this.info = {
        name: 'Wheel',
        description: 'Helps to manage wheeldecide',
        commands: [
          { name: 'wheelstart', callback: WheelModule.prototype.onStart.bind(this) },
          { name: 'startwheel', callback: WheelModule.prototype.onStart.bind(this) },
          { name: 'wheelinfo', callback: WheelModule.prototype.onInfo.bind(this) },
          { name: 'infowheel', callback: WheelModule.prototype.onInfo.bind(this) },
          { name: 'endwheel', callback: WheelModule.prototype.onEnd.bind(this) },
          { name: 'wheelend', callback: WheelModule.prototype.onEnd.bind(this) },
        ],
        callbacks: { 'join': WheelModule.prototype.onJoin.bind(this) },
        cooldown: this.C.userCommandCooldown,
    };

    this._started = false;
    this._mode = "";
    this._defaultMode = "normal";
    this._list;
    this._lastWheelInfo = -1;
    var self = this;

    var server = http.createServer(function (request, response) {
        response.writeHead(200, {"Content-Type": "text/html"});
        if (!self._list)
            return response.end(htmlBefore + "Start a wheel with !wheelstart" + htmlAfter);
        var result = [];
        var i = 0;
        for (var name in self._list)
        {
            if (!((i++) % self.C.reroll.repeat) && i > 1)
                result.push(self.getString(self.C.reroll.text));
            if (self._mode == "normal")
            {
                var user = global.misaka.config.obj.users[name.toLowerCase()];
                if (user && user.alias)
                    result.push(self.getString(user.alias) || name);
                else
                    result.push(name);
            }
            else
                result.push(self._list[name]);
        }
        response.end(htmlBefore + result.join("<br/>") + htmlAfter);
    });

    server.listen(this.C.serverPort);
}

WheelModule.prototype.onJoin = function(data)
{
    var client = global.misaka.getBot().getClient();
    var self = this;
    client.getSocket().on('userMsg', function(data) { if (!data.history) { self.onMessage(data); }});
};

WheelModule.prototype.onStart = function(data)
{
    if (data.sender != global.misaka.config.obj.master)
        return ;
    if (this._started)
        return this.C.wheel_already_started;
    this._mode = data.parsed.tail.toLowerCase();
    if (!this._mode)
        this._mode = this._defaultMode;
    if (!this.C.modes[this._mode])
        return "Unknow mode " + data.parsed.tail;
    this._started = true;
    this._lastWheelInfo = -1;
    this._list = {};
    return this.getString(this.C.modes[this._mode].wheelstart_message);
};

WheelModule.prototype.onInfo = function(data)
{
    console.log(data.sender != global.misaka.config.obj.master, data.sender, global.misaka.config.obj.master);
    if (data.sender != global.misaka.config.obj.master && (!this.C.wheelinfo_user || this._lastWheelInfo > new Date().getTime() - this.C.wheelinfo_cooldown * 1000))
        return ;
    this._lastWheelInfo = new Date().getTime();
    if (!this._started)
        return this.C.no_wheel_started;
    return this.getString(this.C.modes[this._mode].wheelinfo_message);
};

WheelModule.prototype.onEnd = function(data)
{
    if (data.sender != global.misaka.config.obj.master)
        return ;
    if (!this._started)
        return this.C.no_wheel_started;
    this._started = false;
    return this.getString(this.C.modes[this._mode].wheelend_message);
};

WheelModule.prototype.onMessage = function(data)
{
    var client = global.misaka.getBot().getClient();

    if (this._started && data.msg.trim()[0] == '#' && data.username != global.misaka.config.obj.username)
    {
        var tag = data.msg.trim().replace('#', '');
        if (this._mode != "normal")
        {
            if (!this.C.modes[this._mode].allow_multiple)
                for (var name in this._list)
                    if (this._list[name] == tag && name != data.username)
                    {
                        if (this.C.messages.tag_already_in_message)
                            client.sendMessage("@" + data.username + ": #" + tag + " is already in");
                        return ;
                    }
            if (this._list[data.username] && this._list[data.username] != tag && this.C.messages.user_changed_tag)
                client.sendMessage("@" + data.username + " changed his tag to \"" + tag + '"');
        }
        this._list[data.username] = tag;
    }
};

WheelModule.prototype.getString = function(c)
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

module.exports = WheelModule;
